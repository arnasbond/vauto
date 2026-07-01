/** Shared heuristics for vehicle make/model/plate/VIN detection (LT + EU brands). */

export const VEHICLE_BRAND_PATTERN =
  /\b(bmw|audi|vw|volkswagen|mercedes|benz|toyota|opel|ford|peugeot|citroen|citroën|renault|skoda|škoda|seat|nissan|honda|mazda|volvo|kia|hyundai|mitsubishi|subaru|lexus|porsche|fiat|alfa|jeep|dodge|chevrolet|tesla|suzuki|dacia|lada|saab|mini|land rover|range rover)\b/i;

export const VEHICLE_GENERIC_PATTERN =
  /\b(auto|automob|automobili|mašin|masin|vairas|rida|dyzel|benzin|varik|sedan|universal|hečbek|hatchback|visureig|suv|coupe|kabrio|ratlank|padang|felg|disk|noriu parduot.*auto|parduod.*auto|parduod.*masin|parduod.*automobil|parduod.*mašin|superku.*auto|perku.*auto|ieškau.*auto|ieskau.*auto)\b/i;

export const LT_PLATE_PATTERN = /\b[A-Z]{3}\s?\d{3}\b/i;

export const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;

export function normalizePlate(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

export function normalizeVin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function extractPlateFromQuery(query: string): string | null {
  const m = query.match(LT_PLATE_PATTERN);
  return m ? normalizePlate(m[0]) : null;
}

export function extractVinFromQuery(query: string): string | null {
  const m = query.match(VIN_PATTERN);
  return m ? normalizeVin(m[0]) : null;
}

export function isVehicleQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  const lower = q.toLowerCase();
  if (/\b(superku|perku|nuperku|ieškau|ieskau)\b.{0,24}\b(auto|automob|mašin|masin)/i.test(lower)) {
    return true;
  }
  return (
    VEHICLE_BRAND_PATTERN.test(q) ||
    VEHICLE_GENERIC_PATTERN.test(q) ||
    Boolean(extractPlateFromQuery(q)) ||
    Boolean(extractVinFromQuery(q))
  );
}

export function detectVehicleMake(text: string): string | null {
  const m = text.match(VEHICLE_BRAND_PATTERN);
  if (!m) return null;
  const brand = m[1].toLowerCase();
  const labels: Record<string, string> = {
    vw: "Volkswagen",
    volkswagen: "Volkswagen",
    benz: "Mercedes-Benz",
    mercedes: "Mercedes-Benz",
    citroen: "Citroën",
    citroën: "Citroën",
    skoda: "Škoda",
    škoda: "Škoda",
  };
  return labels[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}
