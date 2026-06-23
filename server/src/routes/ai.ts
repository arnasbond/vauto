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
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
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

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string",
  "needsClarification": "boolean",
  "followUpQuestion": "string | null",
  "missingFields": ["string"],
  "imageSearchQuery": "string",
  "mergedTranscript": "string",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1"
}`;

const REFERENCE_FALLBACK: Record<string, string[]> = {
  electronics: [
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
  ],
  vehicles: [
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
  ],
  other: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
  ],
};

aiRouter.post("/analyze-voice", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { transcript, mode, history, userCity } = req.body as {
    transcript: string;
    mode?: "search" | "listing";
    history?: { role: "user" | "assistant"; text: string }[];
    userCity?: string;
  };

  if (!transcript?.trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }

  const historyText = (history ?? [])
    .map((h) => `${h.role === "user" ? "Vartotojas" : "AI"}: ${h.text}`)
    .join("\n");
  const modeHint =
    mode === "listing"
      ? "Vartotojas nori įdėti / parduoti skelbimą."
      : "Vartotojas ieško prekės ar paslaugos.";

  try {
    const raw = await chatJson(key, [
      {
        role: "system",
        content: `Esi Vauto balso asistentas Lietuvoje. ${modeHint} Jei trūksta kritinės info — užduok VIENĮ klausimą lietuviškai. imageSearchQuery angliškai.`,
      },
      {
        role: "user",
        content: `Istorija:\n${historyText || "(tuščia)"}\n\nĮrašas: "${transcript}"\nJSON: ${VOICE_INTENT_SCHEMA}\nMiestas: ${userCity ?? "Lietuva"}`,
      },
    ]);
    res.json({
      understoodSummary: String(raw.understoodSummary ?? "Supratau"),
      needsClarification: Boolean(raw.needsClarification),
      followUpQuestion: raw.followUpQuestion ? String(raw.followUpQuestion) : null,
      missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.map(String) : [],
      imageSearchQuery: String(raw.imageSearchQuery ?? transcript).slice(0, 80),
      mergedTranscript: String(raw.mergedTranscript ?? transcript),
      category: String(raw.category ?? "other"),
      confidence: Number(raw.confidence) || 0.75,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/reference-images", async (req, res) => {
  const { query, category, limit = 4 } = req.body as {
    query: string;
    category?: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query.trim());
    url.searchParams.set("gsrlimit", String(Math.min(limit, 6)));
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "400");

    const wikiRes = await fetch(url.toString(), {
      headers: { "User-Agent": "VautoApp/1.0" },
    });

    const images: string[] = [];
    if (wikiRes.ok) {
      const data = (await wikiRes.json()) as {
        query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> };
      };
      for (const page of Object.values(data.query?.pages ?? {})) {
        const thumb = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url;
        if (thumb) images.push(thumb);
      }
    }

    if (!images.length) {
      const key = category && REFERENCE_FALLBACK[category] ? category : "other";
      res.json({ images: (REFERENCE_FALLBACK[key] ?? REFERENCE_FALLBACK.other).slice(0, limit) });
      return;
    }

    res.json({ images: images.slice(0, limit) });
  } catch {
    const key = category && REFERENCE_FALLBACK[category] ? category : "other";
    res.json({ images: (REFERENCE_FALLBACK[key] ?? REFERENCE_FALLBACK.other).slice(0, limit) });
  }
});

aiRouter.post("/extract-combined", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { imageDataUrl, imageDataUrls, text, extraContext, userCity, contact } =
    req.body as {
      imageDataUrl?: string;
      imageDataUrls?: string[];
      text?: string;
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
  const transcript = [text, extraContext]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!images.length || !transcript) {
    return res.status(400).json({ error: "imageDataUrl and text are required" });
  }

  const imageCountNote =
    images.length > 1
      ? ` Vartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";

  try {
    const raw = await chatJson(key, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Ištrauk skelbimo duomenis iš nuotraukos IR vartotojo balso/teksto aprašymo vienu kartu. Tekstas turi prioritetą kainai, vietai ir detalėms; nuotrauka — objekto atpažinimui ir kategorijai. Atpažink tiksliai pagrindinį objektą.${imageCountNote} Vartotojo aprašymas: "${transcript}" JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
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

aiRouter.post("/transcribe-audio", async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });

  const { audioBase64, mimeType = "audio/webm" } = req.body as {
    audioBase64?: string;
    mimeType?: string;
  };

  if (!audioBase64?.trim()) {
    return res.status(400).json({ error: "audioBase64 is required" });
  }

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), "recording.webm");
    form.append("model", "whisper-1");
    form.append("language", "lt");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return res.status(500).json({ error: `Whisper: ${whisperRes.status} ${err}` });
    }

    const data = (await whisperRes.json()) as { text?: string };
    res.json({ text: String(data.text ?? "").trim() });
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

aiRouter.post("/analyze-report", async (req, res) => {
  const { comment, category, listingTitle, chatPreview } = req.body as {
    comment?: string;
    category?: string;
    listingTitle?: string;
    chatPreview?: string;
  };

  if (!comment?.trim() || !category?.trim()) {
    return res.status(400).json({ error: "comment and category required" });
  }

  try {
    const { analyzeReportWithAi } = await import("../ai/report-analysis.js");
    const analysis = await analyzeReportWithAi({
      comment: comment.trim(),
      category: category.trim(),
      listingTitle,
      chatPreview,
    });
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
