import { getOpenAiKey } from "@/lib/openai-settings";
import { ENTERPRISE_TONE_RULES } from "@/lib/ai-safeguards";
import { VISION_EXTRACTION_INSTRUCTIONS } from "@/lib/vision-prompt";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";

const EXTRACTION_SCHEMA = `{
  "title": "string — lietuviškas skelbimo pavadinimas",
  "price": "number — kaina eurais",
  "location": "string — Lietuvos miestas",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1",
  "description": "string (optional)",
  "attributes": "category-specific object"
}`;

async function chatJson(
  messages: object[],
  model = "gpt-4o"
): Promise<Record<string, unknown>> {
  const key = getOpenAiKey();
  if (!key) throw new Error("OpenAI API raktas nenustatytas");

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI klaida: ${res.status} ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Tuščias OpenAI atsakymas");
  return JSON.parse(content);
}

function parseAttributes(
  raw: unknown
): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = String(v);
  }
  return out;
}

function parseListing(
  raw: Record<string, unknown>,
  contact: string
): AiExtractedListing {
  const category = String(raw.category ?? "other") as ListingCategory;
  const valid: ListingCategory[] = [
    "electronics",
    "vehicles",
    "services",
    "home",
    "clothing",
    "real_estate",
    "other",
  ];

  return {
    title: String(raw.title ?? "Skelbimas"),
    price: Number(raw.price) || 0,
    location: String(raw.location ?? "Lietuva"),
    contact,
    category: valid.includes(category) ? category : "other",
    description: raw.description ? String(raw.description) : undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.8)),
    attributes: parseAttributes(raw.attributes),
  };
}

/** GPT-4o Vision — analyze listing photo(s) */
export async function extractFromImageOpenAI(
  imageDataUrl: string | string[],
  userCity: string,
  contact: string,
  extraContext?: string
): Promise<AiExtractedListing> {
  const images = Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl];
  const contextNote = extraContext?.trim()
    ? `\n\nPapildoma informacija nuo vartotojo (ko nematyti nuotraukose): ${extraContext.trim()}`
    : "";
  const imageCountNote =
    images.length > 1
      ? `\n\nVartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";

  const raw = await chatJson([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ENTERPRISE_TONE_RULES} Tu esi Vauto skelbimų portalo AI asistentas Lietuvoje. ${VISION_EXTRACTION_INSTRUCTIONS}${imageCountNote}${contextNote} Grąžink JSON: ${EXTRACTION_SCHEMA}. Vartotojo miestas: ${userCity}. Kontaktai bus pridėti atskirai.`,
        },
        ...images.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "high" as const },
        })),
      ],
    },
  ]);

  return parseListing(raw, contact);
}

/** GPT-4o — parse voice transcript into listing fields */
export async function extractFromVoiceOpenAI(
  transcript: string,
  userCity: string,
  contact: string
): Promise<AiExtractedListing> {
  const raw = await chatJson([
    {
      role: "system",
      content:
        `${ENTERPRISE_TONE_RULES} Esi Vauto AI asistentas. Iš lietuviško balso aprašymo ištrauk skelbimo duomenis. Kainą interpretuok iš žodžių (pvz. 'dešimt eurų' = 10).`,
    },
    {
      role: "user",
      content: `Transkriptas: "${transcript}"\n\nGrąžink JSON: ${EXTRACTION_SCHEMA}\nNumatyta vieta jei nepaminėta: ${userCity}`,
    },
  ]);

  return parseListing(raw, contact);
}

/** GPT-4o — parse free-form text */
export async function extractFromTextOpenAI(
  text: string,
  userCity: string,
  contact: string
): Promise<AiExtractedListing> {
  const raw = await chatJson([
    {
      role: "system",
      content:
        `${ENTERPRISE_TONE_RULES} Esi Vauto AI. Iš laisvos formos lietuviško teksto ištrauk skelbimo duomenis. Pašalink parazitinius žodžius. Jei kainos nėra — price: 0.`,
    },
    {
      role: "user",
      content: `Tekstas: "${text}"\n\nGrąžink JSON: ${EXTRACTION_SCHEMA}\nNumatyta vieta: ${userCity}`,
    },
  ]);

  return parseListing(raw, contact);
}

/** GPT-4o Vision + text — single call for photo + voice/text */
export async function extractCombinedOpenAI(
  imageDataUrl: string | string[],
  transcript: string,
  userCity: string,
  contact: string,
  extraContext?: string
): Promise<AiExtractedListing> {
  const images = Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl];
  const contextNote = extraContext?.trim()
    ? `\n\nPapildomas kontekstas: ${extraContext.trim()}`
    : "";
  const imageCountNote =
    images.length > 1
      ? `\n\nVartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";

  const raw = await chatJson([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ENTERPRISE_TONE_RULES} Ištrauk skelbimo duomenis iš nuotraukos IR vartotojo aprašymo vienu kartu. Tekstas turi prioritetą kainai, vietai ir detalėms; nuotrauka — objekto atpažinimui ir kategorijai.${imageCountNote}${contextNote} Vartotojo aprašymas: "${transcript}" Grąžink JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity}.`,
        },
        ...images.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "high" as const },
        })),
      ],
    },
  ]);

  return parseListing(raw, contact);
}

/** Whisper — transcribe audio blob (when Web Speech API unavailable) */
export async function transcribeAudioOpenAI(blob: Blob): Promise<string> {
  const key = getOpenAiKey();
  if (!key) throw new Error("OpenAI API raktas nenustatytas");

  const form = new FormData();
  form.append("file", blob, "recording.webm");
  form.append("model", "whisper-1");
  form.append("language", "lt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper klaida: ${res.status} ${err}`);
  }

  const data = await res.json();
  return String(data.text ?? "");
}

/** GPT-4o — analyze voice intent with optional clarification */
export async function analyzeVoiceIntentOpenAI(params: {
  transcript: string;
  mode: "search" | "listing";
  history: { role: "user" | "assistant"; text: string }[];
  userCity: string;
  schema: string;
}): Promise<import("@/lib/voice-intent").VoiceIntentAnalysis> {
  const historyText = params.history
    .map((h) => `${h.role === "user" ? "Vartotojas" : "AI"}: ${h.text}`)
    .join("\n");

  const modeHint =
    params.mode === "listing"
      ? "Vartotojas nori įdėti / parduoti skelbimą."
      : "Vartotojas ieško prekės ar paslaugos.";

  const raw = await chatJson(
    [
      {
        role: "system",
        content: `${ENTERPRISE_TONE_RULES} Esi Vauto balso asistentas Lietuvoje. ${modeHint} Jei trūksta kritinės info (modelis, metai, būklė, matmenys) — užduok VIENĄ trumpą klausimą lietuviškai. Po 2 klausimų tęsk su tuo, ką turi. imageSearchQuery — angliški raktažodžiai nuotraukų paieškai.`,
      },
      {
        role: "user",
        content: `Pokalbio istorija:\n${historyText || "(tuščia)"}\n\nNaujas vartotojo įrašas: "${params.transcript}"\n\nGrąžink JSON: ${params.schema}\nMiestas: ${params.userCity}`,
      },
    ],
    "gpt-4o-mini"
  );

  return {
    understoodSummary: String(raw.understoodSummary ?? "Supratau jūsų užklausą"),
    needsClarification: Boolean(raw.needsClarification),
    followUpQuestion: raw.followUpQuestion ? String(raw.followUpQuestion) : null,
    missingFields: Array.isArray(raw.missingFields)
      ? raw.missingFields.map(String)
      : [],
    imageSearchQuery: String(raw.imageSearchQuery ?? params.transcript).slice(0, 80),
    mergedTranscript: String(raw.mergedTranscript ?? params.transcript),
    category: String(raw.category ?? "other"),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.75)),
  };
}
