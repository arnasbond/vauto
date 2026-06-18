import type { Listing } from "@/lib/types";

export const JOB_TYPE_OFFER = "Siūlau darbą";
export const JOB_TYPE_SEEK = "Ieškau darbo";

export function isJobListing(listing: Listing): boolean {
  return listing.category === "jobs";
}

export function getJobType(listing: Listing): string | null {
  if (!isJobListing(listing)) return null;
  const jt = listing.attributes?.jobType;
  return typeof jt === "string" ? jt : null;
}

export function isJobOffer(listing: Listing): boolean {
  return getJobType(listing) === JOB_TYPE_OFFER;
}

export function isJobSeeker(listing: Listing): boolean {
  return getJobType(listing) === JOB_TYPE_SEEK;
}

export function jobTypeBadge(listing: Listing): string | null {
  if (isJobOffer(listing)) return "Siūlau darbą";
  if (isJobSeeker(listing)) return "Ieškau darbo";
  return null;
}
