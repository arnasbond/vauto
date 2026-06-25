const PLACEHOLDER_CITY =
  /^(miestas|city|unknown|n\/?a|—|-+|\.*|xxx|placeholder|location|vieta)$/i;

function isPlaceholderCity(value) {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (PLACEHOLDER_CITY.test(v)) return true;
  return v.toLowerCase() === "miestas";
}

function resolveListingCity(raw, fallback = "Vilnius") {
  const fb = String(fallback ?? "").trim();
  const fbResolved =
    !fb || isPlaceholderCity(fb) || fb === "Lietuva" ? "Vilnius" : fb;
  const val = String(raw ?? "").trim();
  if (isPlaceholderCity(val)) return fbResolved;
  return val;
}

const VAUTO_UNIFIED_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",
  "price": "number | null — kaina EUR; null jei nenurodyta",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …). NIEKADA žodis Miestas",
  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai (4–8 sakiniai, be emoji, pirkėjus traukiantis tonas)",
  "technicalFields": "object — kategorijai būdingi laukai",
  "confidence": "number 0-1"
}`;

const SYSTEM_RULES = `Tu esi VAUTO — išmanus lietuviškas skelbimų portalo AI asistentas.
Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Suprask laisvą lietuvišką tekstą arba nuotrauką: ar vartotojas nori PARDUOTI (sell), IEŠKOTI (search), PASLAUGOS (service), ar bendrai (general).
Kategoriją parink tiksliai pagal objektą. Aprašymą (description) sugeneruok išsamiai lietuviškai — ne vieno sakinio suvestinė, o pilnas skelbimo tekstas su nauda pirkėjui, būkle, komplektacija ir kita svarbia informacija iš vartotojo žinutės.`;

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

const UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

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

function parseJsonFromText(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return JSON.parse(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Could not parse JSON from Gemini response");
}

const DEFAULT_JSON_SYSTEM =
  "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.";

async function geminiJson({
  prompt,
  imageDataUrls = [],
  model,
  systemInstruction = DEFAULT_JSON_SYSTEM,
}) {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.AI_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const userParts = [{ text: prompt }];
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
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return parseJsonFromText(text);
}

async function unifiedLlmJson(input) {
  const prompt = input?.prompt;
  const systemInstruction = input?.systemInstruction ?? DEFAULT_JSON_SYSTEM;
  const imageDataUrls = input?.imageDataUrls ?? [];
  if (!prompt?.trim()) throw new Error("prompt is required");

  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.AI_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY not configured on server");
  }

  let lastError;
  for (const model of UNIFIED_GEMINI_MODELS) {
    try {
      return await geminiJson({ prompt, imageDataUrls, model, systemInstruction });
    } catch (e) {
      lastError = e;
      console.warn(`[vauto-unified] ${model}:`, e.message);
    }
  }

  throw new Error(
    lastError?.message ? `Gemini API nepavyko: ${lastError.message}` : "Gemini API nepavyko"
  );
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
    location: resolveListingCity(raw.city ?? raw.location, userCity),
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
    ? `\nPapildomas kontekstas (prioritetas aprašymui ir detalėms): ${extraContext.trim()}`
    : "";
  return `${SYSTEM_RULES}

Svarbu: lauką description užpildyk pilnu, profesionaliu skelbimo aprašymu lietuviškai (mažiausiai 4 sakiniai).

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
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.AI_KEY?.trim() ||
      process.env.GOOGLE_AI_API_KEY?.trim()
  );
}

async function handleVautoServerAction(body) {
  const imagesEarly =
    Array.isArray(body.imageDataUrls) && body.imageDataUrls.length
      ? body.imageDataUrls
      : body.imageDataUrl
        ? [body.imageDataUrl]
        : [];

  let action = body.action;
  if (action === "analyze") {
    action = imagesEarly.length ? "analyze_image" : "parse_text";
  }
  const city = resolveListingCity(body.userCity?.trim(), "Vilnius");
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
    const raw = await unifiedLlmJson({
      prompt: buildTextPrompt(text, city, body.extraContext),
    });
    return { ok: true, action, parsed: raw, listing: toListingPayload(raw, city, contact) };
  }

  if (action === "analyze_image" || action === "parse_combined") {
    if (!images.length) {
      const err = new Error("imageDataUrl is required");
      err.status = 400;
      throw err;
    }
    const raw = await unifiedLlmJson({
      prompt: buildImagePrompt(city, body.text, body.extraContext),
      imageDataUrls: images,
    });
    return { ok: true, action, parsed: raw, listing: toListingPayload(raw, city, contact) };
  }

  const err = new Error(`Unknown action: ${action}`);
  err.status = 400;
  throw err;
}

module.exports = {
  handleVautoServerAction,
  hasAiKey,
  unifiedLlmJson,
};
