import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import {
  DetectDocumentTextCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { createWorker } from "tesseract.js";
import { logProductionWarn } from "../../../lib/production-log.js";
import { isPlausibleVin } from "../../../vehicle/vin-utils.js";
import {
  extractBarcodesFromText,
  isValidBarcode,
} from "../../../product/barcode-utils.js";
import { fetchImageBytes, imageBytesToBase64 } from "../image-bytes.js";
import type {
  OcrPipelineResult,
  OcrProvider,
  OcrTextBlock,
  VisualPipelineImageInput,
} from "../types.js";

export function extractVinToken(text: string): string | null {
  const bounded = text.toUpperCase().match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (bounded?.[1] && isPlausibleVin(bounded[1])) return bounded[1];

  // Avoid false 17-char windows when an LT plate is present in the same OCR line.
  if (extractPlateToken(text)) return null;

  const compact = text.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (compact.length === 17 && isPlausibleVin(compact)) return compact;
  const m = compact.match(/[A-HJ-NPR-Z0-9]{17}/);
  return m && isPlausibleVin(m[0]) ? m[0] : null;
}

export function extractPlateToken(text: string): string | null {
  const m = text.trim().toUpperCase().match(/\b([A-Z]{3})\s?(\d{3})\b/);
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

export function classifyOcrLine(text: string): OcrTextBlock["kind"] {
  const t = text.trim();
  if (extractPlateToken(t)) return "vin_plate";
  if (extractVinToken(t)) return "vin_plate";
  if (extractBarcodesFromText(t).length > 0 || (/\b\d{13}\b/.test(t) && isValidBarcode(t))) {
    return "barcode";
  }
  if (/\b\d{8,14}\b/.test(t)) return "serial";
  if (/\b[A-Z]{2,5}[- ]?\d{2,6}[A-Z0-9]*\b/i.test(t)) return "model_code";
  if (/€|eur|kaina|price/i.test(t)) return "price_tag";
  if (/model|serija|serial|sku|ean|ref/i.test(t)) return "label";
  return "other";
}

function mergeBlocks(
  blocks: OcrTextBlock[],
  provider: OcrProvider
): OcrPipelineResult {
  const mergedText = blocks
    .map((b) => b.text)
    .join("\n")
    .trim();
  const extractedCodes = [
    ...new Set([
      ...extractBarcodesFromText(mergedText),
      ...blocks
        .filter((b) => b.kind === "barcode" || b.kind === "serial" || b.kind === "label")
        .flatMap((b) => extractBarcodesFromText(b.text)),
    ]),
  ];
  return {
    blocks,
    mergedText,
    extractedCodes,
    provider,
  };
}

function resolveGoogleCredentials(): Record<string, unknown> | null {
  const inline = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON?.trim();
  if (inline) {
    try {
      return JSON.parse(inline) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credPath) return null;
  try {
    return JSON.parse(readFileSync(credPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let googleAuthClient: GoogleAuth | null = null;

async function getGoogleVisionToken(): Promise<string> {
  const credentials = resolveGoogleCredentials();
  if (!credentials) throw new Error("Google Vision credentials not configured");

  if (!googleAuthClient) {
    googleAuthClient = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-vision"],
    });
  }
  const client = await googleAuthClient.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google Vision access token unavailable");
  return token.token;
}

function parseVisionTextAnnotations(
  annotations: Array<{ description?: string }> | undefined
): OcrTextBlock[] {
  const full = annotations?.[0]?.description?.trim();
  if (!full) return [];
  return full
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      confidence: 0.85,
      kind: classifyOcrLine(text),
    }));
}

async function ocrGoogleVision(images: VisualPipelineImageInput[]): Promise<OcrPipelineResult> {
  const token = await getGoogleVisionToken();
  const blocks: OcrTextBlock[] = [];

  for (const img of images.slice(0, 6)) {
    const bytes = await fetchImageBytes(img.processedUrl ?? img.sourceUrl);
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBytesToBase64(bytes) },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Google Vision HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string };
      }>;
    };

    const response = data.responses?.[0];
    if (response?.error?.message) {
      throw new Error(`Google Vision: ${response.error.message}`);
    }

    const fullText = response?.fullTextAnnotation?.text?.trim();
    if (fullText) {
      for (const line of fullText.split("\n")) {
        const text = line.trim();
        if (!text) continue;
        blocks.push({ text, confidence: 0.88, kind: classifyOcrLine(text) });
      }
    } else {
      blocks.push(...parseVisionTextAnnotations(response?.textAnnotations));
    }
  }

  return mergeBlocks(blocks, "google_vision");
}

function parseTextractBlocks(
  blocks: Array<{ BlockType?: string; Text?: string; Confidence?: number }> | undefined
): OcrTextBlock[] {
  const out: OcrTextBlock[] = [];
  for (const block of blocks ?? []) {
    if (block.BlockType !== "LINE" || !block.Text?.trim()) continue;
    const text = block.Text.trim();
    out.push({
      text,
      confidence: Math.min(1, Math.max(0, (block.Confidence ?? 80) / 100)),
      kind: classifyOcrLine(text),
    });
  }
  return out;
}

async function ocrTextract(images: VisualPipelineImageInput[]): Promise<OcrPipelineResult> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Textract credentials not configured");
  }

  const client = new TextractClient({
    region: process.env.AWS_REGION?.trim() || "eu-central-1",
    credentials: { accessKeyId, secretAccessKey },
  });

  const blocks: OcrTextBlock[] = [];
  for (const img of images.slice(0, 6)) {
    const bytes = await fetchImageBytes(img.processedUrl ?? img.sourceUrl);
    const result = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: bytes } })
    );
    blocks.push(...parseTextractBlocks(result.Blocks));
  }

  return mergeBlocks(blocks, "textract");
}

async function ocrTesseractFallback(images: VisualPipelineImageInput[]): Promise<OcrPipelineResult> {
  if (!images.length) return mergeBlocks([], "tesseract");

  const worker = await createWorker("lit+eng", 1, {
    logger: () => undefined,
  });
  const blocks: OcrTextBlock[] = [];

  try {
    for (const img of images.slice(0, 4)) {
      const url = img.processedUrl ?? img.sourceUrl;
      const { data } = await worker.recognize(url);
      const pageData = data as {
        text?: string;
        confidence?: number;
        lines?: Array<{ text?: string; confidence?: number }>;
      };
      const lines = pageData.lines ?? [];
      for (const line of lines) {
        const text = line.text?.trim();
        if (!text) continue;
        blocks.push({
          text,
          confidence: Math.min(1, Math.max(0, (line.confidence ?? 55) / 100)),
          kind: classifyOcrLine(text),
        });
      }
      if (!lines.length && pageData.text?.trim()) {
        for (const line of pageData.text.split("\n")) {
          const text = line.trim();
          if (!text) continue;
          blocks.push({
            text,
            confidence: Math.min(1, Math.max(0, (pageData.confidence ?? 55) / 100)),
            kind: classifyOcrLine(text),
          });
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  return mergeBlocks(blocks, "tesseract");
}

async function runPrimaryOcr(
  images: VisualPipelineImageInput[],
  provider: OcrProvider
): Promise<OcrPipelineResult> {
  switch (provider) {
    case "google_vision":
      return ocrGoogleVision(images);
    case "textract":
      return ocrTextract(images);
    case "tesseract":
    case "none":
    default:
      return ocrTesseractFallback(images);
  }
}

export async function runOcrPipeline(
  images: VisualPipelineImageInput[],
  provider: OcrProvider
): Promise<OcrPipelineResult> {
  const effective =
    provider === "none" ? ("tesseract" as OcrProvider) : provider;

  try {
    return await runPrimaryOcr(images, effective);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (effective === "tesseract") throw e;

    logProductionWarn("visual-pipeline", "OCR primary failed — tesseract fallback", {
      provider: effective,
      error: msg,
    });
    return ocrTesseractFallback(images);
  }
}
