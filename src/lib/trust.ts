import type { Listing, UserProfile } from "@/lib/types";

/** ISO 3779 VIN format — excludes I, O, Q */
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const EU_WMI_PREFIX = /^(VF[1-8]|VR[13]|VS[678]|VN1|VSS|VWV|WBA|WBS|WDB|WDD|WAU|WVW|WV[123]|TMB|TMK|SKO|YV[14]|ZFA|ZFF)/;

export function normalizeVin(vin: string): string {
  return vin.replace(/\s/g, "").toUpperCase();
}

export function isPlausibleVin(vin: string): boolean {
  return VIN_REGEX.test(normalizeVin(vin));
}

export function isEuropeanWmiVin(vin: string): boolean {
  const wmi = normalizeVin(vin).slice(0, 3);
  return EU_WMI_PREFIX.test(wmi);
}

export function isValidVin(vin: string): boolean {
  const normalized = normalizeVin(vin);
  if (!VIN_REGEX.test(normalized)) return false;
  if (isEuropeanWmiVin(normalized)) return true;
  return true;
}

/** Lookup pipelines accept EU VINs even when US checksum would fail. */
export function isValidVinForLookup(vin: string): boolean {
  return isPlausibleVin(vin);
}

/** Mock VIN registry check — accepts well-formed 17-char VINs */
export function verifyVin(vin: string): boolean {
  const normalized = normalizeVin(vin);
  if (!isValidVin(normalized)) return false;
  return !/^(.)\1{16}$/.test(normalized);
}

export function listingHasVerifiedVin(listing: Listing): boolean {
  // Automotive domain only — never show VIN trust on electronics/fashion/etc.
  if (listing.category !== "vehicles" && listing.category !== "transport") {
    return false;
  }
  // Strict: badge requires explicit verification flag + a real VIN in metadata.
  if (listing.vinVerified !== true) return false;
  const vin = listing.attributes?.vin;
  if (typeof vin !== "string" || !isPlausibleVin(vin)) return false;
  return true;
}

export function listingHasVerifiedProvider(listing: Listing): boolean {
  if (listing.category !== "services") return false;
  return listing.providerVerified === true;
}

/** Mock verified service providers (demo sellers) */
export const VERIFIED_SERVICE_SELLERS = new Set([
  "seller-svc-1",
  "seller-svc-2",
  "seller-svc-3",
  "seller-svc-4",
]);

export function isVerifiedServiceSeller(sellerId: string): boolean {
  return VERIFIED_SERVICE_SELLERS.has(sellerId);
}

export function isVerifiedServiceProvider(
  user: Pick<UserProfile, "id" | "role" | "businessType">
): boolean {
  return (
    isVerifiedServiceSeller(user.id) ||
    (user.role === "pro" && user.businessType === "services")
  );
}
