/**
 * Shared VIN normalization and structural plausibility checks.
 * Used by both client and server — must stay identical.
 */

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}

export function isPlausibleVin(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (vin.length !== 17) return false;
  if (/[IOQ]/.test(vin)) return false;
  return VIN_PATTERN.test(vin);
}

/** Detect a full 17-char VIN token in arbitrary text (for leak tests). */
export function containsVinShapedToken(text: string): boolean {
  return /\b[A-HJ-NPR-Z0-9]{17}\b/i.test(text);
}
