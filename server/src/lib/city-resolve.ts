const PLACEHOLDER_CITY =
  /^(miestas|city|unknown|n\/?a|—|-+|\.*|xxx|placeholder|location|vieta)$/i;

const LT_CITIES = [
  "Vilnius",
  "Kaunas",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Alytus",
  "Marijampolė",
  "Utena",
  "Palanga",
];

export function isPlaceholderCity(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (PLACEHOLDER_CITY.test(v)) return true;
  return v.toLowerCase() === "miestas";
}

function normalizeCityCandidate(raw: string): string {
  const val = String(raw ?? "").trim();
  if (!val || isPlaceholderCity(val)) return "";
  if (val.toLowerCase() === "lietuva" || val.toLowerCase() === "visa lietuva") {
    return "";
  }
  const match = LT_CITIES.find((c) => c.toLowerCase() === val.toLowerCase());
  return match ?? val;
}

/**
 * Resolve listing/user city from raw input with optional verified fallback.
 * Never invents Vilnius/Kaunas — returns "" when unknown so chat/PrePublish can ask.
 */
export function resolveListingCity(
  raw: string | undefined | null,
  fallback = ""
): string {
  const fromRaw = normalizeCityCandidate(String(raw ?? ""));
  if (fromRaw) return fromRaw;
  return normalizeCityCandidate(String(fallback ?? ""));
}

/**
 * Keep LLM city ONLY when grounded in profile, geo, or user text.
 * Prevents schema-example leaks (e.g. inventing "Kaunas" from "Vilnius, Kaunas, …").
 */
export function sanitizeListingCity(
  llmCity: string | undefined | null,
  opts: {
    profileCity?: string | null;
    geoCityHint?: string | null;
    userText?: string | null;
  } = {}
): string {
  const candidate = resolveListingCity(llmCity);
  if (!candidate) return "";

  const profile = resolveListingCity(opts.profileCity);
  if (profile && profile.toLowerCase() === candidate.toLowerCase()) {
    return profile;
  }

  const geo = resolveListingCity(opts.geoCityHint);
  if (geo && geo.toLowerCase() === candidate.toLowerCase()) {
    return geo;
  }

  const text = String(opts.userText ?? "").toLowerCase();
  if (!text.trim()) return "";

  const needle = candidate.toLowerCase();
  if (text.includes(needle)) return candidate;
  // Common LT locative/genitive stems (Kaune, Vilniuje, Klaipėdoje…).
  const stem = needle.replace(/(as|is|ys|ė|a)$/i, "");
  if (stem.length >= 4 && text.includes(stem)) return candidate;

  return "";
}
