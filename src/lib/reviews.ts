import type { SellerReview } from "@/lib/types";

export function computeSellerRating(reviews: SellerReview[], sellerId: string) {
  const mine = reviews.filter((r) => r.sellerId === sellerId);
  if (!mine.length) return { avg: 0, count: 0 };
  const avg =
    Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) /
    10;
  return { avg, count: mine.length };
}

export function canReviewListing(
  reviews: SellerReview[],
  listingId: string,
  reviewerId: string
): boolean {
  if (reviewerId === "guest") return false;
  return !reviews.some(
    (r) => r.listingId === listingId && r.reviewerId === reviewerId
  );
}
