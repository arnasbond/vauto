/** Gemini-only LLM provider for vision, chat JSON, and embeddings. */

import "../load-env.js";
import { resolveGeminiApiKey } from "../load-env.js";

export type AiProvider = "gemini" | null;

export function resolveAiProvider(): AiProvider {
  return resolveGeminiApiKey() ? "gemini" : null;
}

export function hasAiKey(): boolean {
  return Boolean(resolveGeminiApiKey());
}

function parseDataUrl(url: string): { mime: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

async function imageUrlToInlinePart(
  url: string
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  const parsed = parseDataUrl(url);
  if (parsed) {
    return {
      inline_data: { mime_type: parsed.mime, data: parsed.data },
    };
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
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
  systemInstruction = "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų."
): Promise<Record<string, unknown>> {
  const key = resolveGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const userParts: object[] = [{ text: prompt }];
  for (const url of imageDataUrls) {
    const inline = await imageUrlToInlinePart(url);
    if (inline) userParts.push(inline);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: userParts }],
      generationConfig: { temperature: 0.2 },
    }),
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
}

const UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

const DEFAULT_JSON_SYSTEM =
  "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.";

/** VAUTO unified parser — Gemini 2.5 Flash, then 2.5 Flash Lite. */
export async function unifiedLlmJson(
  input: UnifiedLlmJsonInput
): Promise<Record<string, unknown>> {
  const {
    prompt,
    systemInstruction = DEFAULT_JSON_SYSTEM,
    imageDataUrls = [],
  } = input;
  const geminiKey = resolveGeminiApiKey();
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY not configured on server");
  }

  let lastError: unknown;
  for (const model of UNIFIED_GEMINI_MODELS) {
    try {
      return await geminiChatJson(
        prompt,
        imageDataUrls,
        model,
        systemInstruction
      );
    } catch (e) {
      lastError = e;
      console.warn(`[vauto-unified] ${model} failed:`, e);
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Gemini API nepavyko: ${lastError.message}`
      : "Gemini API nepavyko"
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

  let lastError: unknown;
  for (const model of UNIFIED_GEMINI_MODELS) {
    try {
      return await geminiChatJson(prompt, [], model, DEFAULT_JSON_SYSTEM);
    } catch (e) {
      lastError = e;
      console.warn(`[chatJson] ${model} failed:`, e);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini API nepavyko");
}

export async function visionExtractJson(
  prompt: string,
  imageDataUrls: string[]
): Promise<Record<string, unknown>> {
  if (!hasAiKey()) throw new Error("GEMINI_API_KEY not configured");
  return unifiedLlmJson({ prompt, imageDataUrls });
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

  let lastError: unknown;
  for (const model of UNIFIED_GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );
    if (!res.ok) {
      lastError = new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
      continue;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      lastError = new Error("Empty Gemini response");
      continue;
    }
    return text;
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini API nepavyko");
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: trimmed.slice(0, 8000) }] },
      }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  return Array.isArray(values) ? values : null;
}
