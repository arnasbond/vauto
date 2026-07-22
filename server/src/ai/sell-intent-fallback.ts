/**
 * Server-side sell-intent heuristics — mirrors client scoring for fallback drafts (S0.9).
 * NEVER echo the user's raw sentence as title/description.
 * Sparse sell text ("noriu parduoti citroen") → clarify, do NOT invent a draft.
 */
import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";

const SELL_PATTERNS = [
  /\bparduodu\b/i,
  /\bparduosiu\b/i,
  /\bnoriu\s+parduot/i,
  /\bnor[eė]čiau\s+parduot/i,
  /\bnoreciau\s+parduot/i,
  /\bpad[eė]k\s+parduot/i,
  /\bpadek\s+parduot/i,
  /\bįdėti\s+skelb/i,
  /\bideti\s+skelb/i,
  /\bnoriu\s+parduoti\b/i,
  /\bnoriu\s+įkelti\s+skelb/i,
  /\bnoriu\s+ikelti\s+skelb/i,
  /\bsusikaupe\b.*\b(rub|drabuž|drabuz)/i,
  /\bdaug\s+(rub|drabuž|drabuz)/i,
  /\b(atlaisvin|išvalau|isvalau)\s+spint/i,
];

const BUY_PATTERNS = [
  /\bnoriu\s+pirkti\b/i,
  /\bnoreciau\s+pirkti\b/i,
  /\bieškau\b/i,
  /\bieskau\b/i,
  /\bparodyk\b/i,
];

const CLOTHING_HINT = /\b(drabuž|rub|sukn|bat|batus|batel|ked|keln|striuk|spint|megz|maršk|gryb)/i;

const AUTO_BRANDS: { pattern: RegExp; make: string }[] = [
  { pattern: /citro[eë]?n/i, make: "Citroën" },
  { pattern: /\bpeugeot\b/i, make: "Peugeot" },
  { pattern: /\bbmw\b/i, make: "BMW" },
  { pattern: /\bvolkswagen\b|\bvw\b/i, make: "Volkswagen" },
  { pattern: /\btoyota\b/i, make: "Toyota" },
  { pattern: /\bmercedes\b/i, make: "Mercedes-Benz" },
  { pattern: /\baudi\b/i, make: "Audi" },
  { pattern: /\bopel\b/i, make: "Opel" },
  { pattern: /\bford\b/i, make: "Ford" },
  { pattern: /\brenault\b/i, make: "Renault" },
  { pattern: /\bskoda\b/i, make: "Škoda" },
  { pattern: /\bvolvo\b/i, make: "Volvo" },
];

/** Model / year / mileage / engine signals that make a sell note "enough" to draft. */
const SPEC_SIGNAL =
  /\b(c[1-5]\b|berlingo|cactus|picasso|jumpy|spacetourer|xsara|saxo|ds[3-7]|\d{4}\s*m\.?|\b(19|20)\d{2}\b|\b\d{1,3}[\s.]?\d{3}\s*km\b|\b\d{2,4}\s*k[wv]\b|\b\d[.,]\d\s*(?:l|ltr|litrai?)\b|benzinas|dyzel|dizel|elektr|hibrid|automat|mechanin)/i;

export function detectServerSellIntent(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q || q.length < 4) return false;
  if (BUY_PATTERNS.some((re) => re.test(q))) return false;
  return SELL_PATTERNS.some((re) => re.test(q));
}

export function inferMake(text: string): string {
  for (const { pattern, make } of AUTO_BRANDS) {
    if (pattern.test(text)) return make;
  }
  return "";
}

/**
 * Sparse = sell intent without photos/specs (e.g. "noriu parduoti citroen").
 * Must NOT invent a placeholder listing draft.
 */
export function isSparseSellRequest(text: string): boolean {
  if (!detectServerSellIntent(text)) return false;
  const t = text.trim();
  if (SPEC_SIGNAL.test(t)) return false;
  // Brand-only or generic sell phrase without model/year/km/engine.
  const withoutSell = t
    .replace(/\b(parduodu|parduosiu|noriu\s+parduoti?|nor[eė]čiau\s+parduoti?|pad[eė]k\s+parduoti?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutSell.length < 3) return true;
  const make = inferMake(t);
  if (make) {
    // "citroen" / "citroena" alone after stripping sell words → sparse
    const rest = withoutSell
      .replace(/citro[eë]?n\w*/gi, "")
      .replace(new RegExp(make.replace("-", "[-\\s]?"), "ig"), "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return rest.length < 2;
  }
  return withoutSell.length < 18;
}

const INTERNAL_TO_VAUTO_CATEGORY: Record<string, string> = {
  vehicles: "AUTOMOBILIAI",
  real_estate: "NT",
  electronics: "ELEKTRONIKA",
  jobs: "DARBAS",
  home: "NAMAI",
  clothing: "APRANGA",
  services: "PASLAUGOS",
  other: "NAMAI",
};

export function buildSellClarificationReply(
  text: string,
  opts?: { userCity?: string; contact?: string }
): {
  reply: string;
  quickReplies: string[];
  action: {
    type: "listing_draft";
    listingDraft: {
      title: string;
      description: string;
      price: number;
      location: string;
      contact: string;
      category: string;
      confidence: number;
      attributes: Record<string, string>;
      listingFlowState: "DRAFTING_TEXT";
    };
  };
} {
  const make = inferMake(text);
  const category = inferCategory(text);
  const title = make ? `Parduodamas ${make}` : inferTitle(text, category, make);
  // Soft skeleton keeps sell_intent session alive — empty description, no fake fluff.
  const listingDraft = {
    title,
    description: "",
    price: 0,
    location: opts?.userCity?.trim() || "Lietuva",
    contact: opts?.contact?.trim() || "",
    category,
    confidence: 0.45,
    attributes: {
      ...(make ? { make } : {}),
      sellIntentActive: "true",
      awaitingSpecs: "true",
      _vautoCategory: INTERNAL_TO_VAUTO_CATEGORY[category] ?? "AUTOMOBILIAI",
    },
    listingFlowState: "DRAFTING_TEXT" as const,
  };
  if (make) {
    return {
      reply: `Puiku — ruošiame ${make} skelbimą. Parašykite modelį, metus ir variklį (pvz. „C4 Picasso 2007 m. 2.0 ltr. dyzelis“) arba įkelkite nuotraukas / techninį pasą per (+) mygtuką — aš viską sudėsiu į juodraštį.`,
      quickReplies: [],
      action: { type: "listing_draft", listingDraft },
    };
  }
  return {
    reply:
      "Puiku — pradėkime skelbimą. Parašykite ką parduodate (markė, modelis, metai) arba įkelkite nuotraukas / techninį pasą per (+) mygtuką — paruošiu juodraštį be spėlionių.",
    quickReplies: [],
    action: { type: "listing_draft", listingDraft },
  };
}

function inferCategory(text: string): string {
  if (inferMake(text) || /\b(bmw|audi|volvo|mercedes|auto|mašin|masin|citro)/i.test(text)) {
    return "vehicles";
  }
  if (CLOTHING_HINT.test(text)) return "clothing";
  if (/\b(butas|namas|nt|kambar|arėnd|nuom)/i.test(text)) return "real_estate";
  if (/\b(paslaug|remont|valym)/i.test(text)) return "services";
  return "other";
}

function inferTitle(text: string, category: string, make: string): string {
  if (make) return `Parduodamas ${make}`;
  if (category === "vehicles") return "Parduodamas automobilis";
  if (category === "clothing") return "Parduodamas drabužis";
  const cleaned = text
    .replace(/\b(parduodu|parduosiu|noriu\s+parduoti?|nor[eė]čiau\s+parduoti?)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 3 && cleaned.length <= 64) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return "Naujas skelbimas";
}

function buildFallbackDescription(input: {
  title: string;
  category: string;
  make: string;
  location: string;
}): string {
  const subject = input.make || input.title;
  if (input.category === "vehicles" || input.make) {
    return [
      `${subject}: techniniai duomenys bus patikslinti pagal tech passport / nuotraukas (metai, variklis, kW, kuras, rida, komplektacija).`,
      "Matomi defektai ir komplektacija — pagal faktines nuotraukas; dokumentų nuotraukos naudojamos tik specs, ne viešai galerijai.",
      input.location ? `Vieta: ${input.location}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${subject}: konkretūs parametrai pagal jūsų detales ir nuotraukas.`,
    "Be marketinginių frazių — tik faktinė informacija skelbimui.",
  ].join(" ");
}

export interface SellDraftFallback {
  reply: string;
  quickReplies?: string[];
  action: {
    type: "listing_draft";
    listingDraft: {
      title: string;
      description: string;
      price: number;
      location: string;
      contact: string;
      category: string;
      confidence: number;
      attributes: Record<string, string>;
    };
  };
}

/** Pull a EUR price from free-text sell notes (e.g. "už 4500", "4500€"). */
export function extractPriceFromSellText(text: string): number {
  const t = String(text ?? "");
  const patterns = [
    /(?:uz|už|kaina|price)\s*[:=]?\s*(\d[\d\s]{0,8})\s*(?:€|eur)?/i,
    /\b(\d[\d\s]{2,8})\s*(?:€|eur)\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m?.[1]) continue;
    const n = Number(m[1].replace(/\s+/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) return Math.round(n);
  }
  return 0;
}

/**
 * Schema-compatible JSON when Gemini vision hits 429 / RESOURCE_EXHAUSTED.
 * Uses only user text + optional price — no image tokens.
 */
export function buildVisionQuotaTextFallbackJson(input: {
  userText?: string;
  userCity?: string;
  priceHint?: number;
}): Record<string, unknown> {
  const text = String(input.userText ?? "").trim() || "Parduodu automobilį";
  // Sparse text alone must not invent a rich fake listing under quota pressure either.
  if (isSparseSellRequest(text)) {
    const clarify = buildSellClarificationReply(text);
    return {
      intent: "sell",
      category: "AUTOMOBILIAI",
      title: inferMake(text) ? `Parduodamas ${inferMake(text)}` : "Skelbimas",
      price: null,
      city: input.userCity || "Lietuva",
      description: clarify.reply,
      technicalFields: {
        visionQuotaFallback: "true",
        needsClarification: "true",
        sparseSell: "true",
      },
      attributes: {
        visionQuotaFallback: "true",
        needsClarification: "true",
        sparseSell: "true",
      },
      confidence: 0.2,
      sceneContext: "sparse_sell_clarify",
      detectedObjects: [],
      choiceChips: clarify.quickReplies,
      documentReadable: false,
    };
  }
  const draft = buildSellListingDraftFallback(text, {
    userCity: input.userCity,
  }).action.listingDraft;
  const price =
    (input.priceHint && input.priceHint > 0
      ? input.priceHint
      : extractPriceFromSellText(text)) || draft.price || 0;
  const categoryKey =
    INTERNAL_TO_VAUTO_CATEGORY[draft.category] ?? "AUTOMOBILIAI";
  const priceLine =
    price > 0
      ? `Prašoma kaina: ${price} €.`
      : "Kainą galite nurodyti kitame žingsnyje.";
  const description = [
    draft.description,
    "Nuotraukos išsaugotos. Dokumentų (tech passport) vaizdai naudojami tik specs — viešoje galerijoje nerodomi.",
    "AI vaizdo analizė laikinai nepasiekiama — aprašymas sudarytas pagal jūsų tekstą; papildykite metus, ridą, variklį prieš skelbiant.",
    priceLine,
  ].join(" ");

  return {
    intent: "sell",
    category: categoryKey,
    title: draft.title,
    price: price > 0 ? price : null,
    city: draft.location || input.userCity || "Lietuva",
    description,
    technicalFields: {
      ...draft.attributes,
      visionQuotaFallback: "true",
    },
    attributes: {
      ...draft.attributes,
      visionQuotaFallback: "true",
    },
    confidence: 0.7,
    sceneContext: "text_fallback_quota",
    detectedObjects: [],
    choiceChips: [],
  };
}

/**
 * Build a draft ONLY when the sell note already has usable specs.
 * Prefer buildSellClarificationReply for sparse text.
 */
export function buildSellListingDraftFallback(
  text: string,
  ctx: { userCity?: string; contact?: string }
): SellDraftFallback {
  const category = inferCategory(text);
  const make = inferMake(text);
  const title = inferTitle(text, category, make) || "Naujas skelbimas";
  const location = ctx.userCity?.trim() || "";
  const attributes: Record<string, string> = {};
  if (make) {
    attributes.make = make;
  }
  if (category === "clothing") {
    if (/\b(bat|ked|aul)/i.test(text)) {
      attributes.fashionCategory = "Moterims › Bateliai";
      attributes.clothingType = "Bateliai";
    } else {
      attributes.fashionCategory = "Moterims › Kita";
    }
    attributes.condition = "Gera";
  }
  const listingDraft = {
    title,
    description: buildFallbackDescription({ title, category, make, location }),
    price: 0,
    location: location || "Lietuva",
    contact: ctx.contact?.trim() || "",
    category,
    confidence: 0.72,
    attributes,
  };
  return {
    reply: buildListingDraftUpdateReply({
      category,
      title,
      description: listingDraft.description,
      price: listingDraft.price,
      location: listingDraft.location,
      attributes,
    }),
    quickReplies: [],
    action: { type: "listing_draft", listingDraft },
  };
}

export const DOCUMENT_OCR_SOFT_NOTE =
  "Techninio paso nuotrauka kiek neryški — užpildžiau tai, ką įžiūrėjau. Galite patikslinti metus ar variklį čia pokalbyje, arba įkelti aiškesnę nuotrauką per (+).";

/** @deprecated Prefer DOCUMENT_OCR_SOFT_NOTE — soft, non-blocking tone. */
export const DOCUMENT_UNCLEAR_PROMPT = DOCUMENT_OCR_SOFT_NOTE;
