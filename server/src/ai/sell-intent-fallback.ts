/**
 * Server-side sell-intent heuristics — mirrors client scoring for fallback drafts (S0.9).
 */
import { buildCreateListingDraftFollowUp } from "./seller-voice-prompt.js";

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

export function detectServerSellIntent(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q || q.length < 4) return false;
  if (BUY_PATTERNS.some((re) => re.test(q))) return false;
  return SELL_PATTERNS.some((re) => re.test(q));
}

function inferCategory(text: string): string {
  if (CLOTHING_HINT.test(text)) return "clothing";
  if (/\b(bmw|audi|volvo|mercedes|auto|mašin|masin)/i.test(text)) return "vehicles";
  if (/\b(butas|namas|nt|kambar|arėnd|nuom)/i.test(text)) return "real_estate";
  if (/\b(paslaug|remont|valym)/i.test(text)) return "services";
  return "other";
}

function inferTitle(text: string, category: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 72) return trimmed;
  return trimmed.slice(0, 69) + "…";
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
  const title = inferTitle(text, category) || "Naujas skelbimas";
  const attributes: Record<string, string> = {};
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
    description: text.trim(),
    price: 0,
    location: ctx.userCity?.trim() || "Lietuva",
    contact: ctx.contact?.trim() || "+370 612 34567",
    category,
    confidence: 0.72,
    attributes,
  };
  return {
    reply: buildCreateListingDraftFollowUp(category, title, attributes),
    quickReplies:
      category === "clothing"
        ? ["Įkelti nuotraukas", "Ką dar reikia?", "Publikuoti vėliau"]
        : ["Įkelti nuotraukas", "Ką dar reikia?", "Publikuoti vėliau"],
    action: { type: "listing_draft", listingDraft },
  };
}
