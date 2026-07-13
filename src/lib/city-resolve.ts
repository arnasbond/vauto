import {
  coordsForLtCity,
  detectCityInText,
  LT_CITY_NAMES,
} from "@/lib/lt-cities";

const PLACEHOLDER_CITY =
  /^(miestas|city|unknown|n\/?a|—|-+|\.*|xxx|placeholder|location|vieta)$/i;

/** Reject AI/UI placeholders — never send "Miestas" to the API. */
export function isPlaceholderCity(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (PLACEHOLDER_CITY.test(v)) return true;
  return v.toLowerCase() === "miestas";
}

/** Normalize to a known LT city name, or "" when not verifiable. */
export function normalizeKnownListingCity(
  raw: string | undefined | null
): string {
  const val = String(raw ?? "").trim();
  if (!val || isPlaceholderCity(val)) return "";
  if (coordsForLtCity(val)) {
    const match = LT_CITY_NAMES.find((c) => c.toLowerCase() === val.toLowerCase());
    return match ?? detectCityInText(val) ?? "";
  }
  return detectCityInText(val) ?? "";
}

/**
 * Resolve a listing/user city from raw input with optional verified fallback.
 * Never invents Vilnius — returns "" when unknown.
 */
export function resolveListingCity(
  raw: string | undefined | null,
  fallback = ""
): string {
  const fromRaw = normalizeKnownListingCity(raw);
  if (fromRaw) return fromRaw;

  const fromFallback = normalizeKnownListingCity(fallback);
  if (fromFallback) return fromFallback;

  return "";
}
