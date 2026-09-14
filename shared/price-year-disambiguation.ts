/**
 * VAUTO AI Maturity — One Price vs. Vehicle-Year Disambiguation Authority.
 *
 * Single deterministic contract across server, client, and voice fallback:
 * 1. "2000 €", "kaina 2000", "už 2000" -> price (never vehicle year).
 * 2. "metai 2008", "2008 m.", "2008 metų" -> vehicle year (never price).
 * 3. Lone ambiguous "2000" -> fail closed (neither price nor year silently inferred).
 * 4. Specific non-ambiguous 4-digit years (e.g. "2008") -> vehicle year when no price markers exist.
 */

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro|euru|eurais|\$|usd))?$/i;

const PRICE_EXPLICIT_RE =
  /(?:(?:kaina|kainą|kainos|kainuoja|uz|už|price)\s+(?:\p{L}+(?:\s+|$)){0,2}[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:ų|u|ais|o)?|\$|usd))/iu;

const PRICE_BARE_IN_SHORT_RE =
  /(?:^|[^\d])(\d{3,7})(?:[.,]\d{1,2})?(?=[^\d]|$)/;

const EXPLICIT_YEAR_PRE_RE =
  /\b(?:metai|metų|metu|metus|metams|pagaminimo|laidos)\s*:?\s*((?:19|20)\d{2})\b/i;

const EXPLICIT_YEAR_POST_RE =
  /\b((?:19|20)\d{2})\s*(?:m\.|m\b|metai|metų|metus|metu)\b/i;

export function isLikelyVehicleYear(n: number): boolean {
  return Number.isInteger(n) && n >= 1985 && n <= 2026;
}

export function normalizePriceChatText(text: string): string {
  let t = text
    .trim()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\b([Rr]\s*\d{2})\b/g, " $1 ")
    .replace(/\b(\d{2})\s*col(?:i[uų]|ių|iu)?\b/gi, " $1colių ");
  t = t.replace(/(\d)[.,](\d{3})\b/g, "$1$2");
  t = t.replace(/(^|[^\dA-Za-z])(\d{1,3})\s(\d{3})\b/g, "$1$2$3");
  return t.replace(/\s+/g, " ").trim();
}

function parseFinitePrice(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 100_000_000) return null;
  return Math.round(n);
}

/**
 * Deterministic Price Parser.
 *
 * Explicit price syntax ("2000 €", "kaina 2000", "už 2000") -> number.
 * Explicit year syntax ("metai 2008", "2008 m.", "2008 metų") -> null.
 * Lone ambiguous "2000" -> null (fail-closed).
 */
export function parseDisambiguatedPrice(text: string): number | null {
  const rawText = String(text ?? "").trim();
  if (!rawText) return null;

  const hasExplicitYear =
    EXPLICIT_YEAR_PRE_RE.test(rawText) || EXPLICIT_YEAR_POST_RE.test(rawText);
  const hasExplicitPrice = PRICE_EXPLICIT_RE.test(rawText);

  if (hasExplicitYear && !hasExplicitPrice) {
    return null;
  }

  const t = normalizePriceChatText(rawText);
  if (!t) return null;

  const explicit = t.match(PRICE_EXPLICIT_RE);
  if (explicit) {
    const n = parseFinitePrice(explicit[1] || explicit[2] || "");
    if (n != null) return n;
  }

  if (PRICE_ONLY_RE.test(t)) {
    const hasCurrency = /€|eur|\$|usd/i.test(t);
    const n = parseFinitePrice(t.replace(/[^\d.,]/g, ""));
    if (n == null) return null;
    // Without explicit currency, a 4-digit number in the vehicle-year range
    // (e.g. lone "2000" or "2008") is ambiguous and fails closed.
    if (!hasCurrency && isLikelyVehicleYear(n)) return null;
    return n;
  }

  if (t.length <= 80) {
    const bare = t.match(PRICE_BARE_IN_SHORT_RE);
    if (bare?.[1]) {
      const isLeadingAmount = /^\d[\d.,]*(?:\s*(?:€|eur[\p{L}]*|\$|usd))?\s*(?:[.!]|$)/iu.test(t);
      const contextWords = t
        .replace(/€|eur[\p{L}]*|\$|usd/giu, " ")
        .replace(/\d[\d.,\s-]*/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            /\p{L}{2,}/u.test(w) &&
            !/^(parduodu|parduosiu|noriu|norėčiau|noreciau|siūlau|siulau|teikiu|parduoti)$/iu.test(w)
        );
      if (isLeadingAmount || contextWords.length <= 1) {
        const n = Number.parseInt(bare[1], 10);
        if (Number.isFinite(n) && n >= 50 && !isLikelyVehicleYear(n)) return n;
      }
    }
  }

  return null;
}

export function normalizeVehicleYear(raw: string | number): string | null {
  const digits = String(raw).replace(/\D/g, "");
  const yearStr = digits.length === 4 ? digits : String(raw).match(/\b(19|20)\d{2}\b/)?.[0];
  if (!yearStr) return null;
  const year = Number(yearStr);
  if (year < 1985 || year > 2026) return null;
  return String(year);
}

/**
 * Deterministic Vehicle Year Extractor.
 *
 * Explicit price syntax ("2000 €", "kaina 2000", "už 2000") -> null.
 * Explicit year syntax ("metai 2008", "2008 m.", "2008 metų") -> "2008".
 * Lone ambiguous "2000" -> null (fail-closed: no silent year inference).
 * Specific non-ambiguous year ("2008") -> "2008".
 */
export function extractVehicleYearFromText(text: string): string | null {
  const rawText = String(text ?? "").trim();
  if (!rawText) return null;

  // 1. Explicit year markers (highest confidence): e.g. "metai 2008", "2008 m.", "2008 metų"
  const explicitPre = rawText.match(EXPLICIT_YEAR_PRE_RE);
  if (explicitPre?.[1]) {
    return normalizeVehicleYear(explicitPre[1]);
  }
  const explicitPost = rawText.match(EXPLICIT_YEAR_POST_RE);
  if (explicitPost?.[1]) {
    return normalizeVehicleYear(explicitPost[1]);
  }

  // 2. Price authority owns prices: if the canonical price parser claims an amount
  // that equals a 4-digit number, and there are no explicit year markers, the number
  // belongs to the price authority — not the year extractor.
  const claimedPrice = parseDisambiguatedPrice(rawText);
  if (claimedPrice != null) {
    return null;
  }

  // 3. Generic 4-digit candidate:
  const candidates = rawText.matchAll(/\b((?:19|20)\d{2})\b/g);
  for (const match of candidates) {
    const raw = match[1];
    // Ambiguous lone values (e.g. bare "2000" with no explicit year markers)
    // must fail closed: never silently claimed as a vehicle year.
    if (raw === "2000" && !explicitPre && !explicitPost) {
      continue;
    }
    const y = normalizeVehicleYear(raw);
    if (y) return y;
  }

  return null;
}
