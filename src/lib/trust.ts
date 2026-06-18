import type { Listing } from "@/lib/types";

/** ISO 3779 VIN format — excludes I, O, Q */
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(vin: string): string {
  return vin.replace(/\s/g, "").toUpperCase();
}

export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(normalizeVin(vin));
}

/** Mock VIN registry check — accepts well-formed 17-char VINs */
export function verifyVin(vin: string): boolean {
  const normalized = normalizeVin(vin);
  if (!isValidVin(normalized)) return false;
  return !/^(.)\1{16}$/.test(normalized);
}

export function listingHasVerifiedVin(listing: Listing): boolean {
  if (listing.category !== "vehicles") return false;
  if (listing.vinVerified) return true;
  const vin = listing.attributes?.vin;
  if (typeof vin === "string" && verifyVin(vin)) return true;
  return false;
}

export function listingHasVerifiedProvider(listing: Listing): boolean {
  if (listing.category !== "services") return false;
  return listing.providerVerified === true;
}

/** Mock verified service providers (demo sellers) */
export const VERIFIED_SERVICE_SELLERS = new Set([
  "seller-handyman",
  "seller-3",
]);

export function isVerifiedServiceSeller(sellerId: string): boolean {
  return VERIFIED_SERVICE_SELLERS.has(sellerId);
}
