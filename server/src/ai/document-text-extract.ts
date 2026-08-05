import { sanitizePromptUserInput } from "../shared/prompt-injection.js";

export type PendingChatDocumentInput = {
  fileName?: string;
  mimeType?: string;
  text?: string;
  dataUrl?: string;
};

export type ExtractedChatDocument = {
  fileName: string;
  mimeType: string;
  text: string;
};

/** Client pendingDocuments.text hard cap (audit L-03). */
export const PENDING_DOCUMENT_TEXT_MAX = 20_000;
const MAX_TEXT = PENDING_DOCUMENT_TEXT_MAX;
const MAX_COMBINED = 12_000;

function guessMime(fileName: string, fallback = ""): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (n.endsWith(".doc")) return "application/msword";
  return fallback || "application/octet-stream";
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = (m[1] || "application/octet-stream").trim();
  const isBase64 = Boolean(m[2]);
  const payload = m[3] || "";
  try {
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    if (!buffer.length) return null;
    return { mime, buffer };
  } catch {
    return null;
  }
}

function scrubText(raw: string): string {
  const cleaned = String(raw ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
  const scrubbed = sanitizePromptUserInput(cleaned).text;
  return scrubbed || cleaned;
}

/** Best-effort readable strings from legacy .doc binary. */
function extractAsciiFromBinary(buf: Buffer): string {
  const chunks: string[] = [];
  let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c < 127) {
      cur += String.fromCharCode(c);
    } else if (c === 10 || c === 13 || c === 9) {
      cur += " ";
    } else if (cur.length >= 4) {
      chunks.push(cur);
      cur = "";
    } else {
      cur = "";
    }
  }
  if (cur.length >= 4) chunks.push(cur);
  return scrubText(chunks.join(" ").replace(/\s+/g, " "));
}

async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const mime = (mimeType || guessMime(fileName)).toLowerCase();
  const lower = fileName.toLowerCase();

  if (mime === "text/plain" || lower.endsWith(".txt")) {
    return scrubText(buffer.toString("utf8"));
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return scrubText(String(result?.value ?? ""));
    } catch (err) {
      console.warn("[document-extract] mammoth failed", err);
      return "";
    }
  }

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      // pdf-parse is CJS; keep require for ESM server build.
      const pdfParse = require("pdf-parse") as (
        data: Buffer
      ) => Promise<{ text?: string }>;
      const parsed = await pdfParse(buffer);
      return scrubText(String(parsed?.text ?? ""));
    } catch (err) {
      console.warn("[document-extract] pdf-parse failed", err);
      return "";
    }
  }

  if (mime === "application/msword" || lower.endsWith(".doc")) {
    return extractAsciiFromBinary(buffer);
  }

  return "";
}

export async function extractPendingChatDocuments(
  docs: PendingChatDocumentInput[] | undefined
): Promise<ExtractedChatDocument[]> {
  if (!docs?.length) return [];
  const out: ExtractedChatDocument[] = [];

  for (const raw of docs.slice(0, 5)) {
    const fileName = String(raw.fileName ?? "dokumentas").trim() || "dokumentas";
    const mimeType = guessMime(fileName, String(raw.mimeType ?? ""));
    const pre = scrubText(String(raw.text ?? ""));
    if (pre) {
      out.push({ fileName, mimeType, text: pre });
      continue;
    }
    const dataUrl = String(raw.dataUrl ?? "").trim();
    if (!dataUrl.startsWith("data:")) continue;
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) continue;
    const text = await extractFromBuffer(
      parsed.buffer,
      mimeType || parsed.mime,
      fileName
    );
    if (!text) continue;
    out.push({ fileName, mimeType: mimeType || parsed.mime, text });
  }

  return out;
}

export function combineDocumentFacts(docs: ExtractedChatDocument[]): string {
  if (!docs.length) return "";
  const blocks = docs.map((d) => {
    const body = d.text.slice(0, 4_000);
    return `--- ${d.fileName} ---\n${body}`;
  });
  return blocks.join("\n\n").slice(0, MAX_COMBINED);
}

export function mergeDocumentFactsIntoAttributes(
  attributes: Record<string, string> | undefined,
  docs: ExtractedChatDocument[]
): Record<string, string> {
  const next = { ...(attributes ?? {}) };
  if (!docs.length) return next;
  const names = docs.map((d) => d.fileName).filter(Boolean);
  const combined = combineDocumentFacts(docs);
  const prior = String(next.attachedDocumentText ?? next.documentFacts ?? "").trim();
  const mergedText = [prior, combined].filter(Boolean).join("\n\n").slice(0, MAX_COMBINED);
  next.attachedDocumentNames = names.join("|");
  next.attachedDocumentText = mergedText;
  next.documentFacts = mergedText;
  return next;
}
