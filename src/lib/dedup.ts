import type { Listing } from "@/lib/types";

function normalize(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

/** Simple title similarity — blocks obvious spam duplicates from same seller */
export function isDuplicateListing(
  title: string,
  sellerId: string,
  listings: Listing[]
): boolean {
  const norm = normalize(title);
  if (norm.length < 4) return false;

  return listings.some((l) => {
    if (l.sellerId !== sellerId) return false;
    const other = normalize(l.title);
    if (other === norm) return true;
    if (other.includes(norm) || norm.includes(other)) {
      return Math.min(norm.length, other.length) / Math.max(norm.length, other.length) > 0.75;
    }
    return false;
  });
}
