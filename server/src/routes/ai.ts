import { Router } from "express";
import {
  chatJson,
  hasAiKey,
  resolveAiProvider,
  visionExtractJson,
} from "../ai/llm-provider.js";
import { analyzeSearchIntent } from "../ai/search-intent.js";

export const aiRouter = Router();

const AI_UNAVAILABLE = { error: "GEMINI_API_KEY not set" };

aiRouter.get("/health", (_req, res) => {
  const provider = resolveAiProvider();
  res.json({
    ok: true,
    gemini: provider !== null,
    provider,
    mode: provider ?? "demo",
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

const VEHICLE_VISION_RULES = `Jei nuotraukoje matomas visas automobilis (Citroën, Peugeot, BMW, VW ir kt.) — category "vehicles", title su make+model, attributes: make, model, year (jei matoma), fuelType, mileage (jei matoma), bodyType.
Jei auto dalis (ratlankis, padanga) — category "vehicles" su partType, size, condition, quantity.
Jei mobilus telefonas — category "electronics", ne vehicles.`;

aiRouter.post("/extract-image", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

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
    const raw = await visionExtractJson(
      `Ištrauk skelbimo duomenis iš nuotraukos taip, kad vartotojas galėtų iškart rasti panašią prekę arba publikuoti skelbimą. ${VEHICLE_VISION_RULES} Atpažink tiksliai pagrindinį objektą — category ir title turi atitikti tai, ką realiai matai. Kaina EUR.${imageCountNote}${contextNote} JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
      images
    );
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
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

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
      ? "Vartotojas nori įdėti / parduoti skelbimą — NE paieška."
      : "Nustatyk ar vartotojas IEŠKO prekės, ar nori KELTI skelbimą. Jei kelia skelbimą — needsClarification tik dėl trūkstamų laukų, ne imageSearchQuery.";

  try {
    const raw = await chatJson([
      {
        role: "system",
        content: `Esi Vauto balso asistentas Lietuvoje (tik Gemini). ${modeHint} understoodSummary — lietuviškai, BE žodžių „ieškoti“ jei vartotojas kelia skelbimą. imageSearchQuery — tik kai vartotojas IEŠKO, angliški raktažodžiai.
Jei vartotojas kelia skelbimą (sell/listing) ir trūksta laukų — needsClarification=true ir followUpQuestion vienu TTS klausimu (pvz. automobiliui: „AI užpildė markę ir modelį. Kokiais metais pagamintas jūsų automobilis ir kokia būtų kaina?“).`,
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
  } catch {
    res.json({
      understoodSummary: "Ne viską aiškiai supratau",
      needsClarification: true,
      followUpQuestion:
        "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?",
      missingFields: [],
      imageSearchQuery: "",
      mergedTranscript: String(transcript ?? ""),
      category: "other",
      confidence: 0.2,
    });
  }
});

aiRouter.post("/analyze-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { query, userCity } = req.body as {
    query?: string;
    userCity?: string;
  };

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const result = await analyzeSearchIntent({ query: query.trim(), userCity });
    res.json(result);
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
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

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
    const raw = await visionExtractJson(
      `Ištrauk skelbimo duomenis iš nuotraukos IR vartotojo balso/teksto aprašymo vienu kartu. ${VEHICLE_VISION_RULES} Tekstas turi prioritetą kainai, vietai ir detalėms; nuotrauka — objekto atpažinimui ir kategorijai.${imageCountNote} Vartotojo aprašymas: "${transcript}" JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
      images
    );
    res.json(toListing(raw, city, phone));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/import-url", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json({ ...AI_UNAVAILABLE, code: "unavailable" });

  const { url, userCity, contact } = req.body as {
    url: string;
    userCity?: string;
    contact?: string;
  };

  if (!url?.trim()) {
    return res.status(400).json({ error: "url is required", code: "missing_url" });
  }

  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";

  function stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  try {
    let pageRes: Response;
    try {
      pageRes = await fetch(url.trim(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VautoBot/1.0; +https://vauto-chi.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (fetchErr) {
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === "AbortError" || fetchErr.name === "TimeoutError");
      return res.status(502).json({
        error: isTimeout
          ? "Portalo puslapis neatsakė laiku — bandykite vėliau arba užpildykite ranka."
          : "Nepavyko pasiekti portalo — patikrinkite nuorodą arba užpildykite ranka.",
        code: isTimeout ? "timeout" : "fetch_failed",
      });
    }

    if (!pageRes.ok) {
      return res.status(502).json({
        error: "Portalo puslapis neprieinamas — užpildykite skelbimą ranka.",
        code: "fetch_failed",
      });
    }

    const html = await pageRes.text();
    const text = stripHtml(html).slice(0, 14_000);

    if (text.length < 80) {
      return res.status(422).json({
        error: "Puslapio turinys per trumpas — užpildykite laukus ranka.",
        code: "empty_content",
      });
    }

    const raw = await chatJson([
      {
        role: "system",
        content:
          "Ištrauk skelbimo duomenis iš lietuviško portalo HTML. VAUTO veikia visoje Lietuvoje. Grąžink attributes su giliais laukais (auto: year, mileage, bodyType; NT: propertyType, area, heating; drabužiai: size, condition; darbas: jobTitle, salaryGross).",
      },
      {
        role: "user",
        content: `URL: ${url}\nTekstas:\n"""${text}"""\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${city}`,
      },
    ]);
    const listing = toListing(raw, city, phone);
    listing.attributes = {
      ...listing.attributes,
      _importUrl: url.trim(),
    };
    res.json(listing);
  } catch (e) {
    res.status(500).json({
      error: "Nepavyko apdoroti importo — užpildykite skelbimą ranka.",
      code: "parse_failed",
    });
  }
});

aiRouter.post("/extract-text", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { text, userCity, contact } = req.body as {
    text: string;
    userCity?: string;
    contact?: string;
  };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";

  try {
    const raw = await chatJson([
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

aiRouter.post("/image-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { imageDataUrl, limit = 40 } = req.body as {
    imageDataUrl?: string;
    limit?: number;
  };

  if (!imageDataUrl?.trim()) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const { imageSearchScores } = await import("../ai/image-embedding.js");
    const scores = await imageSearchScores(imageDataUrl, limit);
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/semantic-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { profile, limit = 40 } = req.body as {
    profile?: {
      title?: string;
      category?: string;
      price?: number;
      location?: string;
      description?: string;
    };
    limit?: number;
  };

  if (!profile?.title) {
    return res.status(400).json({ error: "profile.title is required" });
  }

  try {
    const { buildVisualProfileText, semanticSearchScores } = await import(
      "../ai/listing-embedding.js"
    );
    const queryText = buildVisualProfileText({
      title: profile.title,
      category: profile.category ?? "other",
      location: profile.location,
      description: profile.description,
      price: profile.price,
    });
    const scores = await semanticSearchScores(queryText, limit);
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/visual-rank", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { profile, candidates } = req.body as {
    profile?: {
      title?: string;
      category?: string;
      price?: number;
      location?: string;
      description?: string;
    };
    candidates?: {
      id: string;
      title: string;
      category: string;
      price: number;
      location: string;
    }[];
  };

  if (!profile?.title || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "profile.title and candidates[] required" });
  }

  const listText = candidates
    .slice(0, 40)
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | ${c.title} | ${c.category} | ${c.price}€ | ${c.location}`
    )
    .join("\n");

  const prompt = `Vartotojas ieško panašių skelbimų pagal AI atpažintą objektą.
Objektas: "${profile.title}" (kategorija: ${profile.category}, kaina ~${profile.price ?? 0}€, vieta: ${profile.location ?? "Lietuva"})
${profile.description ? `Aprašymas: ${profile.description}` : ""}

Įvertink kiekvieno kandidato panašumą 0.0–1.0.
Grąžink JSON: { "scores": { "<listing-id>": 0.0-1.0 } }

Kandidatai:
${listText}`;

  try {
    const raw = await chatJson([
      {
        role: "system",
        content:
          "Esi Vauto paieškos rerankeris. Grąžink tik JSON su scores objektu.",
      },
      { role: "user", content: prompt },
    ]);

    const scores =
      raw.scores && typeof raw.scores === "object"
        ? (raw.scores as Record<string, unknown>)
        : {};
    const normalized: Record<string, number> = {};
    for (const c of candidates) {
      const v = Number(scores[c.id]);
      if (Number.isFinite(v)) normalized[c.id] = Math.min(1, Math.max(0, v));
    }

    res.json({ scores: normalized });
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
