/** Gemini-only LLM provider for vision, chat JSON, and embeddings. */

import "../load-env.js";
import { normalizeImageDataUrl } from "./image-input.js";
import { resolveGeminiApiKey } from "../load-env.js";

/** Stay under Render free-tier ~30s request limit. */
const GEMINI_FETCH_TIMEOUT_MS = 25_000;

export type AiProvider = "gemini" | null;

export function resolveAiProvider(): AiProvider {
  return resolveGeminiApiKey() ? "gemini" : null;
}

export function hasAiKey(): boolean {
  return Boolean(resolveGeminiApiKey());
}

function parseDataUrl(url: string): { mime: string; data: string } | null {
  const normalized = normalizeImageDataUrl(url);
  if (!normalized) return null;
  if (normalized.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(normalized);
    if (!m) return null;
    return { mime: m[1]!, data: m[2]! };
  }
  return null;
}

async function imageUrlToInlinePart(
  url: string
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  const normalized = normalizeImageDataUrl(url);
  if (!normalized) return null;

  const parsed = parseDataUrl(normalized);
  if (parsed) {
    return {
      inline_data: { mime_type: parsed.mime, data: parsed.data },
    };
  }

  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    const res = await fetch(normalized, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      inline_data: { mime_type: mime, data: buf.toString("base64") },
    };
  } catch {
    return null;
  }
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    return JSON.parse(fence[1].trim()) as Record<string, unknown>;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error("Could not parse JSON from Gemini response");
}

async function geminiChatJson(
  prompt: string,
  imageDataUrls: string[] = [],
  model = "gemini-2.5-flash",
  systemInstruction = "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.",
  temperature = 0.2
): Promise<Record<string, unknown>> {
  const key = resolveGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const userParts: object[] = [{ text: prompt }];
  for (const url of imageDataUrls) {
    const inline = await imageUrlToInlinePart(url);
    if (inline) userParts.push(inline);
  }

  if (imageDataUrls.length > 0 && userParts.length < 2) {
    throw new Error("Invalid image payload: could not decode base64 or data URL");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: userParts }],
      generationConfig: {
        temperature: Math.min(1, Math.max(0, temperature)),
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return parseJsonFromText(text);
}

export interface UnifiedLlmJsonInput {
  prompt: string;
  systemInstruction?: string;
  imageDataUrls?: string[];
  /** Higher (~0.35) lets the model interpret typos/slang/no-diacritics more freely. */
  temperature?: number;
}

const UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

const DEFAULT_JSON_SYSTEM =
  "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.";

/** Gemini high-demand statuses worth retrying before failing over to the next model. */
const GEMINI_RETRY_STATUSES = new Set([429, 503]);
const GEMINI_JSON_MAX_RETRIES = 2;
const GEMINI_JSON_RETRY_BASE_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Extract HTTP status from a thrown `Gemini <model> <status>: ...` error message. */
function parseGeminiStatus(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /\b(4\d{2}|5\d{2})\b/.exec(msg);
  if (m) return Number(m[1]);
  if (/UNAVAILABLE|overloaded|rate.?limit|high demand|too many/i.test(msg)) return 503;
  return null;
}

/**
 * Run a Gemini call across the model fallback chain with per-model 429/503
 * retry + exponential backoff. Keeps the whole AI pipeline (wardrobe vision,
 * persona copy, profile import, search intent) resilient under high demand.
 */
async function callGeminiWithRetry<T>(
  fn: (model: string) => Promise<T>,
  label: string
): Promise<T> {
  let lastError: unknown;
  for (const model of UNIFIED_GEMINI_MODELS) {
    for (let attempt = 0; attempt <= GEMINI_JSON_MAX_RETRIES; attempt++) {
      try {
        return await fn(model);
      } catch (e) {
        lastError = e;
        const status = parseGeminiStatus(e);
        const canRetry =
          attempt < GEMINI_JSON_MAX_RETRIES &&
          status !== null &&
          GEMINI_RETRY_STATUSES.has(status);
        console.warn(
          `[${label}] ${model} attempt ${attempt + 1}${canRetry ? " (will retry)" : ""}:`,
          e instanceof Error ? e.message : e
        );
        if (!canRetry) break;
        await sleep(GEMINI_JSON_RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini API nepavyko");
}

/** VAUTO unified parser — Gemini 2.5 Flash, then 2.5 Flash Lite. */
export async function unifiedLlmJson(
  input: UnifiedLlmJsonInput
): Promise<Record<string, unknown>> {
  const {
    prompt,
    systemInstruction = DEFAULT_JSON_SYSTEM,
    imageDataUrls = [],
    temperature = 0.2,
  } = input;
  const geminiKey = resolveGeminiApiKey();
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY not configured on server");
  }

  return callGeminiWithRetry(
    (model) =>
      geminiChatJson(prompt, imageDataUrls, model, systemInstruction, temperature),
    "vauto-unified"
  );
}

export async function chatJson(
  messages: object[],
  _model?: string
): Promise<Record<string, unknown>> {
  if (!hasAiKey()) throw new Error("GEMINI_API_KEY not configured");
  const prompt = messages
    .map((m) => {
      const msg = m as { role?: string; content?: unknown };
      const role = msg.role ?? "user";
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return `${role}: ${content}`;
    })
    .join("\n\n");

  return callGeminiWithRetry(
    (model) => geminiChatJson(prompt, [], model, DEFAULT_JSON_SYSTEM),
    "chatJson"
  );
}

export async function visionExtractJson(
  prompt: string,
  imageDataUrls: string[],
  temperature?: number
): Promise<Record<string, unknown>> {
  if (!hasAiKey()) throw new Error("GEMINI_API_KEY not configured");
  return unifiedLlmJson({ prompt, imageDataUrls, temperature });
}

async function geminiGeneratePlainText(
  prompt: string,
  imageDataUrls: string[] = []
): Promise<string> {
  const key = resolveGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const parts: object[] = [{ text: prompt }];
  for (const url of imageDataUrls) {
    const inline = await imageUrlToInlinePart(url);
    if (inline) parts.push(inline);
  }

  return callGeminiWithRetry(async (model) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error("Empty Gemini response");
    return text;
  }, "geminiText");
}

export async function visionDescribe(
  prompt: string,
  imageUrl: string
): Promise<string | null> {
  if (!hasAiKey()) return null;
  try {
    return await geminiGeneratePlainText(prompt, [imageUrl]);
  } catch {
    return null;
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const key = resolveGeminiApiKey();
  if (!key) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: trimmed.slice(0, 8000) }] },
      }),
      signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  return Array.isArray(values) ? values : null;
}
