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

/** Inflected forms only — never bare stems (\"kaun\" ⊆ \"kaina\"). */
const LT_CITY_TEXT_FORMS: Record<string, string[]> = {
  Vilnius: ["vilnius", "vilniuje", "vilniaus", "vilniui", "vilnių"],
  Kaunas: ["kaunas", "kaune", "kauno", "kaunui", "kauną"],
  Klaipėda: ["klaipėda", "klaipeda", "klaipėdoje", "klaipedoje", "klaipėdos", "klaipedos"],
  Šiauliai: ["šiauliai", "siauliai", "šiauliuose", "siauliuose", "šiaulių", "siauliu"],
  Panevėžys: ["panevėžys", "panevezys", "panevėžyje", "panevezyje", "panevėžio", "panevezio"],
  Alytus: ["alytus", "alyte", "alytoje", "alytaus"],
  Marijampolė: ["marijampolė", "marijampole", "marijampolėje", "marijampoleje", "marijampolės"],
  Utena: ["utena", "utenoje", "utenos"],
  Palanga: ["palanga", "palangoje", "palangos"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True only when user text mentions the city as a word (not a substring of \"kaina\"). */
export function textMentionsLtCity(userText: string, city: string): boolean {
  const text = String(userText ?? "").toLowerCase();
  if (!text.trim()) return false;
  const canonical = normalizeCityCandidate(city);
  if (!canonical) return false;
  const forms =
    LT_CITY_TEXT_FORMS[canonical] ?? [canonical.toLowerCase()];
  return forms.some((form) =>
    new RegExp(`\\b${escapeRegExp(form)}\\b`, "i").test(text)
  );
}

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

  if (textMentionsLtCity(String(opts.userText ?? ""), candidate)) {
    return candidate;
  }

  return "";
}
