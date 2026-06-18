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
  "category": "electronics | vehicles | services | home | other",
  "confidence": "number 0-1"
}`;

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

  const { imageDataUrl, userCity, contact } = req.body as {
    imageDataUrl: string;
    userCity: string;
    contact: string;
  };

  try {
    const raw = await chatJson(key, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Ištrauk skelbimo duomenis iš nuotraukos. JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity}`,
          },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
        ],
      },
    ]);
    res.json({
      title: String(raw.title ?? "Skelbimas"),
      price: Number(raw.price) || 0,
      location: String(raw.location ?? userCity),
      contact,
      category: String(raw.category ?? "other"),
      confidence: Number(raw.confidence) || 0.8,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/extract-text", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { text, userCity, contact } = req.body as {
    text: string;
    userCity: string;
    contact: string;
  };

  try {
    const raw = await chatJson(key, [
      {
        role: "system",
        content: "Ištrauk skelbimo duomenis iš lietuviško teksto. Jei kainos nėra — price: 0.",
      },
      {
        role: "user",
        content: `Tekstas: "${text}"\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${userCity}`,
      },
    ]);
    res.json({
      title: String(raw.title ?? "Skelbimas"),
      price: Number(raw.price) || 0,
      location: String(raw.location ?? userCity),
      contact,
      category: String(raw.category ?? "other"),
      confidence: Number(raw.confidence) || 0.8,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
