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
 * Never invents Vilnius — returns "" when unknown so chat/PrePublish can ask.
 */
export function resolveListingCity(
  raw: string | undefined | null,
  fallback = ""
): string {
  const fromRaw = normalizeCityCandidate(String(raw ?? ""));
  if (fromRaw) return fromRaw;
  return normalizeCityCandidate(String(fallback ?? ""));
}
