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

/** Safe image summary for Render logs — never dump full base64. */
export function summarizeImageUrlsForLog(urls: string[]): {
  count: number;
  kinds: string[];
  approxChars: number;
} {
  const kinds: string[] = [];
  let approxChars = 0;
  for (const raw of urls) {
    const u = String(raw ?? "");
    approxChars += u.length;
    if (u.startsWith("data:")) {
      const mime = /^data:([^;]+)/i.exec(u)?.[1] ?? "data";
      kinds.push(`data:${mime}(${u.length})`);
    } else if (/^https?:\/\//i.test(u)) {
      kinds.push(`http(${Math.min(u.length, 80)})`);
    } else {
      kinds.push(`other(${u.slice(0, 24)})`);
    }
  }
  return { count: urls.length, kinds, approxChars };
}

/**
 * Render log UI often drops/truncates the 2nd console.error object arg
 * (shows only `HTTP error {`). Always emit one flat string line.
 */
function visionLogError(label: string, details: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify(details);
  } catch {
    line = String(details);
  }
  console.error(`[vision] ${label} ${line}`);
}

function formatGeminiHttpError(input: {
  model: string;
  status: number;
  statusText: string;
  elapsedMs: number;
  errBody: string;
  contentType?: string | null;
}): string {
  const body = input.errBody.trim() || "(empty body)";
  return (
    `Gemini HTTP ${input.status} ${input.statusText || ""}`.trim() +
    ` model=${input.model} elapsedMs=${input.elapsedMs}` +
    ` contentType=${input.contentType ?? "n/a"}` +
    ` body=${body}`
  );
}

async function imageUrlToInlinePart(
  url: string
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  const normalized = normalizeImageDataUrl(url);
  if (!normalized) {
    console.error("[vision] imageUrlToInlinePart: normalize failed", {
      prefix: String(url ?? "").slice(0, 48),
      len: String(url ?? "").length,
    });
    return null;
  }

  const parsed = parseDataUrl(normalized);
  if (parsed) {
    console.log("[vision] imageUrlToInlinePart: data URL ok", {
      mime: parsed.mime,
      base64Chars: parsed.data.length,
    });
    return {
      inline_data: { mime_type: parsed.mime, data: parsed.data },
    };
  }

  if (!/^https?:\/\//i.test(normalized)) {
    console.error("[vision] imageUrlToInlinePart: unsupported URL kind", {
      prefix: normalized.slice(0, 48),
    });
    return null;
  }
  try {
    const res = await fetch(normalized, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      console.error("[vision] imageUrlToInlinePart: http fetch failed", {
        status: res.status,
        url: normalized.slice(0, 120),
      });
      return null;
    }
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    console.log("[vision] imageUrlToInlinePart: http ok", {
      mime,
      bytes: buf.length,
      url: normalized.slice(0, 120),
    });
    return {
      inline_data: { mime_type: mime, data: buf.toString("base64") },
    };
  } catch (err) {
    console.error(
      "[vision] imageUrlToInlinePart: http exception",
      err instanceof Error ? err.message : err
    );
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

  const imageSummary = summarizeImageUrlsForLog(imageDataUrls);
  console.log("[vision] geminiChatJson start", {
    model,
    temperature,
    promptChars: prompt.length,
    promptHead: prompt.slice(0, 220),
    systemChars: systemInstruction.length,
    images: imageSummary,
    timeoutMs: GEMINI_FETCH_TIMEOUT_MS,
    hasApiKey: Boolean(key),
  });

  const userParts: object[] = [{ text: prompt }];
  let inlineOk = 0;
  for (const url of imageDataUrls) {
    const inline = await imageUrlToInlinePart(url);
    if (inline) {
      inlineOk += 1;
      userParts.push(inline);
    }
  }

  console.log("[vision] geminiChatJson parts ready", {
    model,
    textParts: 1,
    inlineImagesOk: inlineOk,
    inlineImagesRequested: imageDataUrls.length,
    userPartsCount: userParts.length,
  });

  if (imageDataUrls.length > 0 && userParts.length < 2) {
    console.error("[vision] geminiChatJson: no inline images decoded", imageSummary);
    throw new Error("Invalid image payload: could not decode base64 or data URL");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
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
  } catch (fetchErr) {
    const elapsedMs = Date.now() - started;
    const name = fetchErr instanceof Error ? fetchErr.name : "Error";
    const message =
      fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const isTimeout =
      name === "TimeoutError" ||
      name === "AbortError" ||
      /timeout|aborted/i.test(message);
    visionLogError("geminiChatJson FETCH exception", {
      model,
      elapsedMs,
      timeoutMs: GEMINI_FETCH_TIMEOUT_MS,
      isTimeout,
      errorName: name,
      errorMessage: message,
      inlineImagesOk: inlineOk,
      approxRequestChars: imageSummary.approxChars + prompt.length,
    });
    throw new Error(
      `Gemini ${model} fetch ${isTimeout ? "TIMEOUT" : "NETWORK"} after ${elapsedMs}ms: ${name}: ${message}`
    );
  }

  const elapsedMs = Date.now() - started;
  const responseText = await res.text();
  if (!res.ok) {
    const errBody = responseText.slice(0, 4000);
    const contentType = res.headers.get("content-type");
    // Flat single-line log — Render truncates console.error's 2nd object arg.
    console.error(
      `[vision] geminiChatJson HTTP error ${formatGeminiHttpError({
        model,
        status: res.status,
        statusText: res.statusText,
        elapsedMs,
        errBody,
        contentType,
      })}`
    );
    visionLogError("geminiChatJson HTTP error detail", {
      model,
      status: res.status,
      statusText: res.statusText,
      elapsedMs,
      contentType,
      errBodyChars: responseText.length,
      errBody,
      inlineImagesOk: inlineOk,
      inlineImagesRequested: imageDataUrls.length,
      approxPayloadChars: imageSummary.approxChars + prompt.length,
      apiKeyPresent: Boolean(key),
      apiKeyPrefix: key ? `${key.slice(0, 6)}…` : null,
    });
    throw new Error(
      `Gemini ${model} ${res.status}: ${errBody || res.statusText || "empty error body"}`
    );
  }

  let data: {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: unknown;
  };
  try {
    data = JSON.parse(responseText) as typeof data;
  } catch (jsonErr) {
    visionLogError("geminiChatJson response JSON parse failed", {
      model,
      status: res.status,
      elapsedMs,
      parseErr: jsonErr instanceof Error ? jsonErr.message : String(jsonErr),
      bodyHead: responseText.slice(0, 1000),
    });
    throw new Error(`Gemini ${model}: invalid JSON response body`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(
    `[vision] geminiChatJson response ${JSON.stringify({
      model,
      elapsedMs,
      finishReason: data.candidates?.[0]?.finishReason ?? null,
      responseChars: text?.length ?? 0,
      responseHead: text?.slice(0, 280) ?? null,
      promptFeedback: data.promptFeedback ?? null,
      candidateCount: data.candidates?.length ?? 0,
    })}`
  );
  if (!text) {
    visionLogError("geminiChatJson empty text", {
      model,
      status: res.status,
      elapsedMs,
      finishReason: data.candidates?.[0]?.finishReason ?? null,
      promptFeedback: data.promptFeedback ?? null,
      rawKeys: Object.keys(data ?? {}),
      candidateCount: data.candidates?.length ?? 0,
    });
    throw new Error("Empty Gemini response");
  }
  try {
    return parseJsonFromText(text);
  } catch (parseErr) {
    visionLogError("geminiChatJson JSON parse failed", {
      model,
      parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr),
      responseHead: text.slice(0, 1000),
    });
    throw parseErr;
  }
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
  console.log("[vision] unifiedLlmJson enter", {
    hasApiKey: Boolean(geminiKey),
    temperature,
    promptChars: prompt.length,
    images: summarizeImageUrlsForLog(imageDataUrls),
  });
  if (!geminiKey) {
    console.error("[vision] unifiedLlmJson: GEMINI_API_KEY missing");
    throw new Error("GEMINI_API_KEY not configured on server");
  }

  try {
    const result = await callGeminiWithRetry(
      (model) =>
        geminiChatJson(prompt, imageDataUrls, model, systemInstruction, temperature),
      "vauto-unified"
    );
    console.log("[vision] unifiedLlmJson ok", {
      keys: Object.keys(result ?? {}),
      title: String((result as { title?: unknown }).title ?? "").slice(0, 80),
      descriptionChars: String(
        (result as { description?: unknown }).description ?? ""
      ).length,
    });
    return result;
  } catch (err) {
    visionLogError("unifiedLlmJson FAILED", {
      errMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
      images: summarizeImageUrlsForLog(imageDataUrls),
    });
    throw err;
  }
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
  console.log("[vision] visionExtractJson enter", {
    promptChars: prompt.length,
    promptHead: prompt.slice(0, 220),
    temperature: temperature ?? null,
    images: summarizeImageUrlsForLog(imageDataUrls),
    hasApiKey: hasAiKey(),
  });
  if (!hasAiKey()) {
    console.error("[vision] visionExtractJson: GEMINI_API_KEY missing");
    throw new Error("GEMINI_API_KEY not configured");
  }
  try {
    return await unifiedLlmJson({ prompt, imageDataUrls, temperature });
  } catch (err) {
    visionLogError("visionExtractJson FAILED", {
      errMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
    });
    throw err;
  }
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
      const errBody = (await res.text()).slice(0, 4000);
      console.error(
        `[vision] geminiGeneratePlainText HTTP error ${formatGeminiHttpError({
          model,
          status: res.status,
          statusText: res.statusText,
          elapsedMs: 0,
          errBody,
          contentType: res.headers.get("content-type"),
        })}`
      );
      throw new Error(
        `Gemini ${model} ${res.status}: ${errBody || res.statusText || "empty error body"}`
      );
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
