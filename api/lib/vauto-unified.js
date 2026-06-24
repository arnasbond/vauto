const VAUTO_UNIFIED_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",
  "price": "number | null — kaina EUR; null jei nenurodyta",
  "city": "string — Lietuvos miestas arba 'Lietuva'",
  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai (2–5 sakiniai, be emoji)",
  "technicalFields": "object — kategorijai būdingi laukai",
  "confidence": "number 0-1"
}`;

const SYSTEM_RULES = `Tu esi VAUTO — išmanus lietuviškas skelbimų portalo AI asistentas.
Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Suprask laisvą lietuvišką tekstą arba nuotrauką: ar vartotojas nori PARDUOTI (sell), IEŠKOTI (search), PASLAUGOS (service), ar bendrai (general).
Kategoriją parink tiksliai pagal objektą. Aprašymą sugeneruok profesionaliai lietuviškai.`;

const CATEGORY_TO_INTERNAL = {
  AUTOMOBILIAI: "vehicles",
  NT: "real_estate",
  ELEKTRONIKA: "electronics",
  DARBAS: "jobs",
  NAMAI: "home",
  SPORTAS: "other",
  APRANGA: "clothing",
  PASLAUGOS: "services",
  VAIKAMS: "other",
  GYVUNAI: "other",
};

const UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function parseDataUrl(url) {
  const m = String(url).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

async function imageUrlToInlinePart(url) {
  const parsed = parseDataUrl(url);
  if (parsed) {
    return { inline_data: { mime_type: parsed.mime, data: parsed.data } };
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { inline_data: { mime_type: mime, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

async function geminiJson(prompt, imageDataUrls = [], model) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const parts = [{ text: prompt }];
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
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text);
}

async function openaiJson(prompt, imageDataUrls = []) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const content = imageDataUrls.length
    ? [
        { type: "text", text: prompt },
        ...imageDataUrls.map((url) => ({
          type: "image_url",
          image_url: { url, detail: "high" },
        })),
      ]
    : prompt;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");
  return JSON.parse(text);
}

async function unifiedLlmJson(prompt, imageDataUrls = []) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    for (const model of UNIFIED_GEMINI_MODELS) {
      try {
        return await geminiJson(prompt, imageDataUrls, model);
      } catch (e) {
        console.warn(`[vauto-unified] ${model}:`, e.message);
      }
    }
  }
  return openaiJson(prompt, imageDataUrls);
}

function parseTechnicalFields(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === "") continue;
    out[k] = Array.isArray(v) ? v.map(String) : String(v);
  }
  return out;
}

function toListingPayload(raw, userCity, contact) {
  const categoryKey = String(raw.category ?? "NAMAI").toUpperCase();
  const internalCategory = CATEGORY_TO_INTERNAL[categoryKey] ?? "other";
  const priceRaw = raw.price;
  const price =
    priceRaw === null || priceRaw === undefined ? 0 : Number(priceRaw) || 0;
  const technicalFields = parseTechnicalFields(raw.technicalFields ?? raw.attributes);

  return {
    title: String(raw.title ?? "Skelbimas"),
    price,
    location: String(raw.city ?? raw.location ?? userCity),
    contact,
    category: internalCategory,
    description: raw.description ? String(raw.description) : undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.85)),
    attributes: {
      ...technicalFields,
      _intent: String(raw.intent ?? "sell"),
      _vautoCategory: categoryKey,
    },
    intent: String(raw.intent ?? "sell"),
  };
}

function buildTextPrompt(text, userCity, extraContext) {
  const extra = extraContext?.trim()
    ? `\nPapildomas kontekstas: ${extraContext.trim()}`
    : "";
  return `${SYSTEM_RULES}

Vartotojo tekstas: """${text}"""${extra}
Numatytas miestas: ${userCity}
Grąžink JSON: ${VAUTO_UNIFIED_SCHEMA}`;
}

function buildImagePrompt(userCity, text, extraContext) {
  const textNote = text?.trim()
    ? `\nVartotojo papildomas aprašymas: """${text.trim()}"""`
    : "";
  const extra = extraContext?.trim() ? `\nKontekstas: ${extraContext.trim()}` : "";
  return `${SYSTEM_RULES}

Analizuok nuotrauką. Atpažink TIKSLŲ objektą.${textNote}${extra}
Numatytas miestas: ${userCity}
Grąžink JSON: ${VAUTO_UNIFIED_SCHEMA}`;
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_UPLOAD_PRESET?.trim()
  );
}

async function uploadImageToCloudinary(imageDataUrl, folder = "vauto") {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  if (!cloudName || !uploadPreset) {
    const err = new Error("Cloudinary not configured");
    err.status = 503;
    throw err;
  }

  const form = new FormData();
  form.append("file", imageDataUrl);
  form.append("upload_preset", uploadPreset);
  form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    throw new Error(`Cloudinary ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.secure_url) throw new Error("Cloudinary returned no URL");
  return { url: data.secure_url, publicId: data.public_id ?? "" };
}

function hasAiKey() {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  );
}

async function handleVautoServerAction(body) {
  const action = body.action;
  const city = body.userCity?.trim() || "Lietuva";
  const contact = body.contact?.trim() || "+370 612 34567";

  if (action === "upload_media") {
    const image = body.imageDataUrl;
    if (!image?.trim()) {
      const err = new Error("imageDataUrl is required");
      err.status = 400;
      throw err;
    }
    if (!isCloudinaryConfigured()) {
      const err = new Error("Cloudinary not configured");
      err.status = 503;
      throw err;
    }
    const uploaded = await uploadImageToCloudinary(image);
    return { ok: true, action, url: uploaded.url, publicId: uploaded.publicId };
  }

  const images =
    Array.isArray(body.imageDataUrls) && body.imageDataUrls.length
      ? body.imageDataUrls
      : body.imageDataUrl
        ? [body.imageDataUrl]
        : [];

  if (action === "parse_text") {
    const text = body.text?.trim();
    if (!text) {
      const err = new Error("text is required for parse_text");
      err.status = 400;
      throw err;
    }
    const raw = await unifiedLlmJson(buildTextPrompt(text, city, body.extraContext));
    return { ok: true, action, parsed: raw, listing: toListingPayload(raw, city, contact) };
  }

  if (action === "analyze_image" || action === "parse_combined") {
    if (!images.length) {
      const err = new Error("imageDataUrl is required");
      err.status = 400;
      throw err;
    }
    const raw = await unifiedLlmJson(
      buildImagePrompt(city, body.text, body.extraContext),
      images
    );
    return { ok: true, action, parsed: raw, listing: toListingPayload(raw, city, contact) };
  }

  const err = new Error(`Unknown action: ${action}`);
  err.status = 400;
  throw err;
}

module.exports = {
  handleVautoServerAction,
  hasAiKey,
};
