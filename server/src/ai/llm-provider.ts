/** OpenAI + Gemini fallback for vision, chat JSON, and embeddings. */

import { resolveGeminiApiKey, resolveOpenAiApiKey } from "../load-env.js";

export type AiProvider = "openai" | "gemini" | null;

export function resolveAiProvider(): AiProvider {
  if (resolveGeminiApiKey()) return "gemini";
  if (resolveOpenAiApiKey()) return "openai";
  return null;
}

export function hasAiKey(): boolean {
  return resolveAiProvider() !== null;
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

async function openaiChatJson(
  messages: object[],
  model = "gpt-4o-mini"
): Promise<Record<string, unknown>> {
  const key = resolveOpenAiApiKey();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return JSON.parse(content);
}

async function geminiChatJson(
  prompt: string,
  imageDataUrls: string[] = [],
  model = "gemini-2.0-flash"
): Promise<Record<string, unknown>> {
  const key = resolveGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const parts: object[] = [{ text: prompt }];
  for (const url of imageDataUrls) {
    const inline = await imageUrlToInlinePart(url);
    if (inline) parts.push(inline);
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

const UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

/** VAUTO unified parser — prefers Gemini 2.5 Flash, falls back to 2.0 / OpenAI */
export async function unifiedLlmJson(
  prompt: string,
  imageDataUrls: string[] = []
): Promise<Record<string, unknown>> {
  const geminiKey = resolveGeminiApiKey();
  if (geminiKey) {
    for (const model of UNIFIED_GEMINI_MODELS) {
      try {
        return await geminiChatJson(prompt, imageDataUrls, model);
      } catch (e) {
        console.warn(`[vauto-unified] ${model} failed:`, e);
      }
    }
  }

  const openaiKey = resolveOpenAiApiKey();
  if (openaiKey) {
    if (imageDataUrls.length) {
      return openaiChatJson([
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageDataUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "high" as const },
            })),
          ],
        },
      ]);
    }
    return openaiChatJson([{ role: "user", content: prompt }]);
  }

  throw new Error(
    geminiKey
      ? "Gemini API nepavyko — patikrinkite GEMINI_API_KEY arba nustatykite OPENAI_API_KEY atsarginiam režimui"
      : "No AI API key (GEMINI_API_KEY or OPENAI_API_KEY)"
  );
}

export async function chatJson(
  messages: object[],
  model = "gpt-4o-mini"
): Promise<Record<string, unknown>> {
  const provider = resolveAiProvider();
  if (provider === "openai") return openaiChatJson(messages, model);
  if (provider === "gemini") {
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
    return geminiChatJson(prompt);
  }
  throw new Error("No AI API key configured");
}

export async function visionExtractJson(
  prompt: string,
  imageDataUrls: string[]
): Promise<Record<string, unknown>> {
  const provider = resolveAiProvider();
  if (provider === "openai") {
    return openaiChatJson([
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageDataUrls.map((url) => ({
            type: "image_url",
            image_url: { url, detail: "high" },
          })),
        ],
      },
    ]);
  }
  if (provider === "gemini") {
    return geminiChatJson(prompt, imageDataUrls);
  }
  throw new Error("No AI API key configured");
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

export async function visionDescribe(
  prompt: string,
  imageUrl: string
): Promise<string | null> {
  const provider = resolveAiProvider();
  if (!provider) return null;

  try {
    if (provider === "openai") {
      const key = resolveOpenAiApiKey();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: imageUrl, detail: "low" },
                },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    }

    return geminiGeneratePlainText(prompt, [imageUrl]);
  } catch {
    return null;
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const provider = resolveAiProvider();
  if (provider === "openai") {
    const key = resolveOpenAiApiKey();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: trimmed,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  }

  if (provider === "gemini") {
    const key = resolveGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");
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

  return null;
}
