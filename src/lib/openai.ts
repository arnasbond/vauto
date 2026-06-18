import { getOpenAiKey } from "@/lib/openai-settings";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";

const EXTRACTION_SCHEMA = `{
  "title": "string — lietuviškas skelbimo pavadinimas",
  "price": "number — kaina eurais",
  "location": "string — Lietuvos miestas",
  "category": "electronics | vehicles | services | home | other",
  "confidence": "number 0-1"
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
    "other",
  ];

  return {
    title: String(raw.title ?? "Skelbimas"),
    price: Number(raw.price) || 0,
    location: String(raw.location ?? "Panevėžys"),
    contact,
    category: valid.includes(category) ? category : "other",
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.8)),
  };
}

/** GPT-4o Vision — analyze listing photo */
export async function extractFromImageOpenAI(
  imageDataUrl: string,
  userCity: string,
  contact: string
): Promise<AiExtractedListing> {
  const raw = await chatJson([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Tu esi Vauto skelbimų portalo AI asistentas Lietuvoje. Iš nuotraukos ištrauk skelbimo duomenis. Grąžink JSON: ${EXTRACTION_SCHEMA}. Vartotojo miestas: ${userCity}. Kontaktai bus pridėti atskirai.`,
        },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
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
        "Esi Vauto AI asistentas. Iš lietuviško balso aprašymo ištrauk skelbimo duomenis. Kainą interpretuok iš žodžių (pvz. 'dešimt eurų' = 10).",
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
        "Esi Vauto AI. Iš laisvos formos lietuviško teksto ištrauk skelbimo duomenis. Pašalink parazitinius žodžius. Jei kainos nėra — price: 0.",
    },
    {
      role: "user",
      content: `Tekstas: "${text}"\n\nGrąžink JSON: ${EXTRACTION_SCHEMA}\nNumatyta vieta: ${userCity}`,
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
