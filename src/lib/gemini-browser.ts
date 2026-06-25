/**
 * Browser-direct Gemini calls — bypasses Render IP blocks.
 * Restrict the API key to HTTP referrers (vauto-chi.vercel.app, localhost) in Google Cloud.
 */

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

export type ClientSearchCategoryLabel =
  | "Auto"
  | "Elektronika"
  | "Namai"
  | "Drabužiai"
  | "Paslaugos"
  | "NT"
  | "Darbas"
  | null;

export interface ClientSearchIntent {
  category: ClientSearchCategoryLabel;
  cleanQuery: string;
  location: string;
  radiusKm: number | null;
  condition: "used" | "new" | null;
}

const SEARCH_INTENT_SCHEMA = `{
  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas | null",
  "cleanQuery": "string — produkto ar paslaugos pavadinimas lietuviškai, be klausiamųjų žodžių (kas, kur, rask)",
  "location": "string — Lietuvos miestas vardininku (Vilnius, Kaunas, …) arba tuščia eilutė",
  "radiusKm": "number | null — tik 5, 10, 20, 50 arba null",
  "condition": "used | new | null"
}`;

const SEARCH_CATEGORIES = new Set([
  "Auto",
  "Elektronika",
  "Namai",
  "Drabužiai",
  "Paslaugos",
  "NT",
  "Darbas",
]);

export function getClientGeminiApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  return key || null;
}

export function isClientGeminiAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(getClientGeminiApiKey());
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return JSON.parse(fence[1].trim()) as Record<string, unknown>;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error("Could not parse JSON from Gemini response");
}

function snapSearchRadius(km: unknown): number | null {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  return 50;
}

async function geminiChatJson(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      lastError = new Error(`Gemini ${model} ${res.status}`);
      continue;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = new Error("Empty Gemini response");
      continue;
    }

    return parseJsonFromText(text);
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini API nepavyko");
}

/** Structured buyer search intent — called from the user's browser (not Render). */
export async function clientAnalyzeSearchIntent(input: {
  query: string;
  userCity?: string;
}): Promise<ClientSearchIntent> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");
  }

  const query = input.query.trim();
  const systemInstruction = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.
Vartotojas IEŠKO skelbimų — nekelia skelbimo.
Grąžink tik JSON pagal schemą: ${SEARCH_INTENT_SCHEMA}`;

  const userPrompt = `Užklausa: "${query}"
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}`;

  const raw = await geminiChatJson(apiKey, systemInstruction, userPrompt);

  const categoryRaw = raw.category;
  const category =
    categoryRaw == null || categoryRaw === "null"
      ? null
      : SEARCH_CATEGORIES.has(String(categoryRaw))
        ? (String(categoryRaw) as Exclude<ClientSearchCategoryLabel, null>)
        : null;

  return {
    category,
    cleanQuery: String(raw.cleanQuery ?? "").trim(),
    location: String(raw.location ?? "").trim(),
    radiusKm: snapSearchRadius(raw.radiusKm),
    condition:
      raw.condition === "used" || raw.condition === "new" ? raw.condition : null,
  };
}
