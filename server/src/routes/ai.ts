import { Router } from "express";

export const aiRouter = Router();

aiRouter.get("/health", (_req, res) => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  res.json({
    ok: true,
    openai: hasKey,
    mode: hasKey ? "server" : "demo",
  });
});

const EXTRACTION_SCHEMA = `{
  "title": "string",
  "price": "number",
  "location": "string",
  "description": "string",
  "category": "vehicles | clothing | services | real_estate | electronics | home | other",
  "confidence": "number 0-1",
  "attributes": "object with category-specific fields, e.g. auto parts: partType, size, condition, quantity, marketHint"
}`;

function parseAttributes(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = String(v);
  }
  return out;
}

function toListing(raw: Record<string, unknown>, userCity: string, contact: string) {
  return {
    title: String(raw.title ?? "Skelbimas"),
    price: Number(raw.price) || 0,
    location: String(raw.location ?? userCity),
    contact,
    category: String(raw.category ?? "other"),
    description: raw.description ? String(raw.description) : undefined,
    confidence: Number(raw.confidence) || 0.8,
    attributes: parseAttributes(raw.attributes),
  };
}

async function chatJson(
  key: string,
  messages: object[],
  model = "gpt-4o-mini"
): Promise<Record<string, unknown>> {
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
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return JSON.parse(content);
}

aiRouter.post("/extract-image", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { imageDataUrl, imageDataUrls, extraContext, userCity, contact } = req.body as {
    imageDataUrl?: string;
    imageDataUrls?: string[];
    extraContext?: string;
    userCity?: string;
    contact?: string;
  };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";
  const images =
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : [];

  if (!images.length) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  const imageCountNote =
    images.length > 1
      ? ` Vartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";
  const contextNote = extraContext?.trim()
    ? ` Papildoma informacija (ko nematyti nuotraukose): ${extraContext.trim()}`
    : "";

  try {
    const raw = await chatJson(key, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Ištrauk skelbimo duomenis iš nuotraukos taip, kad vartotojas galėtų iškart rasti panašią prekę arba publikuoti skelbimą. Atpažink tiksliai pagrindinį objektą — category ir title turi atitikti tai, ką realiai matai (telefonas → electronics, ne vehicles). Jei auto dalis — category vehicles su partType, size, condition, quantity. Kaina EUR.${imageCountNote}${contextNote} JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
          },
          ...images.map((url) => ({
            type: "image_url",
            image_url: { url, detail: "high" },
          })),
        ],
      },
    ]);
    res.json(toListing(raw, city, phone));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/extract-text", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { text, userCity, contact } = req.body as {
    text: string;
    userCity?: string;
    contact?: string;
  };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";

  try {
    const raw = await chatJson(key, [
      {
        role: "system",
        content:
          "Ištrauk skelbimo duomenis iš lietuviško teksto. Nustatyk kategoriją ir attributes laukus. Jei kainos nėra — price: 0.",
      },
      {
        role: "user",
        content: `Tekstas: "${text}"\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${city}`,
      },
    ]);
    res.json(toListing(raw, city, phone));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
