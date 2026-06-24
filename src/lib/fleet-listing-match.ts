import type { Listing } from "@/lib/types";
import type { PrimaryVehicle } from "@/lib/zero-ui-defaults";
import { resolveDefaultUserCity } from "@/lib/zero-ui-defaults";

const PARTS_RE =
  /\b(dal|dalys|bumper|bamper|generator|alternator|filtr|amort|stabd|varik|transmis|kėbul|kebul|priekin|galin)\b/i;

export function listingMatchesFleet(
  listing: Listing,
  vehicle: PrimaryVehicle,
  region: string
): boolean {
  if (listing.status === "sold" || listing.banned) return false;

  const regionKey = resolveDefaultUserCity(region).toLowerCase().slice(0, 5);
  const loc = listing.location.toLowerCase();
  if (regionKey && !loc.includes(regionKey)) return false;

  const hay = [
    listing.title,
    listing.description ?? "",
    ...listing.tags,
    listing.category,
  ]
    .join(" ")
    .toLowerCase();

  const make = vehicle.make.toLowerCase();
  const model = vehicle.model.toLowerCase();
  const year = String(vehicle.year);

  const hasMake = hay.includes(make);
  const hasModel = hay.includes(model) || model.length <= 2;
  const hasYear = hay.includes(year);
  const isParts = PARTS_RE.test(hay) || listing.category === "vehicles";

  if (!hasMake) return false;
  if (!hasModel && !PARTS_RE.test(hay)) return false;

  return isParts || hasYear || PARTS_RE.test(hay);
}

export function buildFleetMatchMessage(
  listing: Listing,
  vehicle: PrimaryVehicle,
  region: string
): string {
  const city = listing.location.split(",")[0]?.trim() || region;
  return `${city} ką tik įkeltas naujas ${vehicle.make} ${vehicle.model} skelbimas dalims. Žinau, kad vairuoji šį modelį — ar nori, kad atversčiau šį skelbimą?`;
}

export function findNewFleetMatches(
  listings: Listing[],
  seenIds: Set<string>,
  vehicle: PrimaryVehicle,
  region: string
): Listing[] {
  return listings.filter(
    (l) => !seenIds.has(l.id) && listingMatchesFleet(l, vehicle, region)
  );
}
