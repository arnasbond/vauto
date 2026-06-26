import { resolveListingCity } from "@/lib/city-resolve";
import type { ListingEditPatch } from "@/lib/listing-edit";
import type { LegacyListingInput, Listing } from "@/lib/types";

/** Server API expects singular `image`; client models use `images[]`. */
export function listingToApiPayload(listing: Listing): Omit<Listing, "images"> & { image: string } {
  const { images, ...rest } = listing;
  return {
    ...rest,
    location: resolveListingCity(listing.location, "Vilnius"),
    image: images?.[0]?.trim() ?? "",
  };
}

export function listingPatchToApiPayload(
  patch: ListingEditPatch & Partial<Pick<Listing, "banned">>
): Record<string, unknown> {
  const { images, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if (images !== undefined) {
    out.image = images[0]?.trim() ?? "";
  }
  return out;
}

export function isApiListingShape(
  value: Listing | LegacyListingInput
): value is LegacyListingInput & { image?: string } {
  return typeof (value as LegacyListingInput).image === "string";
}
