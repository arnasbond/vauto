/**
 * Smart Authenticity System (3-tier):
 * 1) Hard-block ONLY explicitly declared fakes/replicas (user text).
 * 2) Soft stock/studio photo tip (never block publish).
 * 3) Soft luxury/high-value brand tip when price > 150 EUR (never block).
 */

/** Hard-block copy — explicit fakes / replicas. */
export const REPLICA_HARD_BLOCK_REPLY =
  "VAUTO platformoje klastočių, replikų ir neoriginalių prekių pardavimas yra draudžiamas.";

/** Soft tip — stock / studio photos (never blocks). */
export const STOCK_PHOTO_ADVISORY =
  "Patarimas: skelbimai su gyvomis, tikromis prekės nuotraukomis sulaukia 2 kartus daugiau pirkėjų dėmesio!";

/** Soft tip — high-risk brand + price > 150 EUR (never blocks). */
export function luxuryBrandAdvisory(brand: string): string {
  const b = String(brand ?? "").trim() || "prekės";
  return `Parduodant ${b}, pirkėjų pasitikėjimą padidintų etiketės, serijinio kodo ar pirkimo dokumento nuotrauka.`;
}

export const LUXURY_ADVISORY_PRICE_EUR = 150;

/**
 * Explicit fake/replica declarations in seller text.
 * Honest sellers describing originals must never match.
 */
const EXPLICIT_REPLICA_RE =
  /\b(replika|replik[aąos]|replica|replicas|padirbin\w*|neoriginal\w*|counterfeit|knock[\s-]?off|fakes?|klastot\w*|подделк\w*|фейк\w*)\b/i;

const REPLICA_RATIO_RE = /\b1\s*:\s*1(\s*(copy|kopija|replica|replika))?\b/i;

const REPLICA_KOPIJA_RE =
  /\b(aaa\s+)?(super\s+)?kopija\b|\bne\s+original(as|i|ūs|us|us)?\b|\bnot\s+original\b|\bunoriginal\b/i;

export function detectExplicitReplicaClaim(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (EXPLICIT_REPLICA_RE.test(t)) return true;
  if (REPLICA_RATIO_RE.test(t)) return true;
  if (REPLICA_KOPIJA_RE.test(t)) return true;
  return false;
}

/** High-risk brands for soft authenticity advisory (display name preserved). */
const HIGH_RISK_BRANDS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(apple|iphone|ipad|macbook|airpods)\b/i, label: "Apple" },
  { re: /\bnike\b/i, label: "Nike" },
  { re: /\bgucci\b/i, label: "Gucci" },
  { re: /\blouis\s*vuitton\b|\blv\b/i, label: "Louis Vuitton" },
  { re: /\bbosch\b/i, label: "Bosch" },
  { re: /\bsony\b/i, label: "Sony" },
  { re: /\bmakita\b/i, label: "Makita" },
  { re: /\brolex\b/i, label: "Rolex" },
  { re: /\bchanel\b/i, label: "Chanel" },
  { re: /\bprada\b/i, label: "Prada" },
  { re: /\bherm[eè]s\b/i, label: "Hermès" },
  { re: /\bdior\b/i, label: "Dior" },
  { re: /\bcartier\b/i, label: "Cartier" },
  { re: /\bdewalt\b/i, label: "DeWalt" },
  { re: /\bmilwaukee\b/i, label: "Milwaukee" },
  { re: /\bsamsung\b/i, label: "Samsung" },
  { re: /\badidas\b/i, label: "Adidas" },
];

export function detectHighRiskBrand(
  ...parts: Array<string | null | undefined>
): string | null {
  const hay = parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!hay) return null;
  for (const { re, label } of HIGH_RISK_BRANDS) {
    if (re.test(hay)) return label;
  }
  return null;
}

export type PhotoStyleHint =
  | "real_world"
  | "studio_stock"
  | "mixed"
  | "unknown";

export function normalizePhotoStyle(raw: unknown): PhotoStyleHint {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    /studio_stock|stock|studio_white|seamless|catalog|pure_white|white_bg|studio/.test(
      s
    )
  ) {
    return "studio_stock";
  }
  if (/real_world|lifestyle|in_hand|outdoor|home|garage|street/.test(s)) {
    return "real_world";
  }
  if (/mixed/.test(s)) return "mixed";
  return "unknown";
}

/** Heuristic when Pass-1 omits photoStyle — scene/context cues only. */
export function inferStockStudioFromContext(
  ...parts: Array<string | null | undefined>
): boolean {
  const hay = parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return false;
  return /\b(studio|stock\s*photo|seamless|pure\s*white|white\s*background|baltas\s+fonas|studijin|katalogin|product\s*shot\s*on\s*white)\b/i.test(
    hay
  );
}

export function shouldAdviseStockPhoto(input: {
  photoStyle?: unknown;
  sceneContext?: string;
  attributes?: Record<string, unknown> | null;
}): boolean {
  const style = normalizePhotoStyle(
    input.photoStyle ??
      input.attributes?.photoStyle ??
      input.attributes?.imagePhotoStyle
  );
  if (style === "studio_stock") return true;
  if (style === "real_world") return false;
  return inferStockStudioFromContext(
    input.sceneContext,
    String(input.attributes?.sceneContext ?? ""),
    String(input.attributes?.factNotes ?? "")
  );
}

export function shouldAdviseLuxuryBrand(input: {
  price?: number | null;
  title?: string;
  brand?: string;
  make?: string;
  attributes?: Record<string, unknown> | null;
}): string | null {
  const price = Number(input.price ?? 0);
  if (!(price > LUXURY_ADVISORY_PRICE_EUR)) return null;
  const attrs = input.attributes ?? {};
  return detectHighRiskBrand(
    input.brand,
    input.make,
    input.title,
    String(attrs.brand ?? ""),
    String(attrs.make ?? ""),
    String(attrs.manufacturer ?? ""),
    String(attrs.deviceModel ?? "")
  );
}

/**
 * Build soft advisory sentences to append to chat (never blocks).
 * At most one stock tip + one luxury tip.
 */
export function buildAuthenticitySoftAdvisories(input: {
  photoStyle?: unknown;
  sceneContext?: string;
  price?: number | null;
  title?: string;
  brand?: string;
  make?: string;
  attributes?: Record<string, unknown> | null;
}): string[] {
  const tips: string[] = [];
  if (shouldAdviseStockPhoto(input)) {
    tips.push(STOCK_PHOTO_ADVISORY);
  }
  const brand = shouldAdviseLuxuryBrand(input);
  if (brand) {
    tips.push(luxuryBrandAdvisory(brand));
  }
  return tips;
}

/** Append soft tips to a chat reply (idempotent). */
export function appendAuthenticityAdvisories(
  reply: string,
  tips: string[]
): string {
  const base = String(reply ?? "").trim();
  if (!tips.length) return base;
  const missing = tips.filter((t) => t && !base.includes(t));
  if (!missing.length) return base;
  if (!base) return missing.join("\n\n");
  return `${base}\n\n${missing.join("\n\n")}`;
}
