import type { ParcelSize } from "@/lib/shipping/shipping-provider";

/** Omniva C2C paštomato kainos LT (EUR) pagal pakuotės dydį — M2 checkout. */
export const OMNIVA_PARCEL_PRICES_EUR: Record<ParcelSize, number> = {
  S: 2.29,
  M: 2.99,
  L: 3.99,
};

export const OMNIVA_PARCEL_SIZE_HINTS: Record<ParcelSize, string> = {
  S: "iki ~36×10×60 cm",
  M: "iki ~36×20×60 cm",
  L: "iki ~36×39×60 cm",
};

export function omnivaParcelPriceEur(size: ParcelSize): number {
  return OMNIVA_PARCEL_PRICES_EUR[size] ?? OMNIVA_PARCEL_PRICES_EUR.M;
}

export function formatOmnivaParcelPrice(size: ParcelSize): string {
  return `${omnivaParcelPriceEur(size).toFixed(2)} €`;
}

/** Prefer listing estimatedSize when valid S/M/L. */
export function resolveDefaultParcelSize(
  estimatedSize?: string | null
): ParcelSize {
  const s = String(estimatedSize ?? "")
    .trim()
    .toUpperCase();
  if (s === "S" || s === "M" || s === "L") return s;
  return "M";
}
