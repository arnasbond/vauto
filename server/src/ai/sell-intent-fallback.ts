/**
 * Server-side sell-intent heuristics — mirrors client scoring for fallback drafts (S0.9).
 * NEVER echo the user's raw sentence as title/description.
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

export function detectServerSellIntent(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q || q.length < 4) return false;
  if (BUY_PATTERNS.some((re) => re.test(q))) return false;
  return SELL_PATTERNS.some((re) => re.test(q));
}

function inferMake(text: string): string {
  for (const { pattern, make } of AUTO_BRANDS) {
    if (pattern.test(text)) return make;
  }
  return "";
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
  // Never use the raw user sentence ("noriu parduoti…") as the listing title.
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
      `Parduodamas ${subject} — patrauklus pasirinkimas pirkėjui, kuris ieško praktinio ir patikimo varianto.`,
      "Pagrindinius parametrus (metai, kuras, rida, komplektacija) patikslinsime pagal nuotraukas ir jūsų atsakymus.",
      "Automobilis paruoštas apžiūrai; jei turite klausimų apie servisą ar dokumentus — mielai atsakysime.",
      input.location
        ? `Galima apžiūra: ${input.location}. Susisiekite ir sutarsime patogų laiką.`
        : "Susisiekite dėl apžiūros ir detalių — atsakome greitai.",
    ].join(" ");
  }
  return [
    `Parduodamas ${subject}.`,
    "Paruošiu turtingą skelbimo aprašymą pagal jūsų detales ir nuotraukas.",
    "Susisiekite dėl apžiūros — atsakome greitai.",
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
    quickReplies: ["Judame prie PrePublish", "Papildyti detales"],
    action: { type: "listing_draft", listingDraft },
  };
}
