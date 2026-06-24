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

/** Reject AI/UI placeholders — never send "Miestas" to the API. */
export function isPlaceholderCity(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (PLACEHOLDER_CITY.test(v)) return true;
  return v.toLowerCase() === "miestas";
}

/**
 * Resolve a listing/user city: real name or fallback (user city → Vilnius).
 */
export function resolveListingCity(
  raw: string | undefined | null,
  fallback = "Vilnius"
): string {
  const fb = resolveListingCityFallback(fallback);
  const val = String(raw ?? "").trim();
  if (isPlaceholderCity(val)) return fb;
  return val;
}

function resolveListingCityFallback(fallback: string): string {
  const fb = String(fallback ?? "").trim();
  if (!fb || isPlaceholderCity(fb)) return "Vilnius";
  if (fb === "Lietuva") return "Vilnius";
  const match = LT_CITIES.find((c) => c.toLowerCase() === fb.toLowerCase());
  return match ?? fb;
}
