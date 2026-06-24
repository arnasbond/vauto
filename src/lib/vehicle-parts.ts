import type { Listing } from "@/lib/types";

const PARTS_QUERY = /ratlank|padang|felg|diskas|auto\s*dal|r1[567]\b/i;
const PARTS_TITLE = /ratlank|padang|felg|diskas/i;

/** Wheels/tires and other parts miscategorized as full vehicles. */
export function isVehiclePartsListing(listing: Listing): boolean {
  const attrs = listing.attributes ?? {};
  if (attrs.partType) return true;
  if (listing.category !== "vehicles") return false;
  return PARTS_TITLE.test(listing.title);
}

export function queryWantsVehicleParts(query: string): boolean {
  return PARTS_QUERY.test(query);
}
