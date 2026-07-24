import type { AuthProvider, SellerReview, UserProfile } from "@/lib/types";

export const REVIEW_TAG_OPTIONS = [
  "Greitas atsakas",
  "Patikimas pardavėjas",
  "Puiki prekė",
  "Sąžininga kaina",
  "Malonus bendravimas",
] as const;

export function computeSellerRating(reviews: SellerReview[], sellerId: string) {
  const mine = reviews.filter((r) => r.sellerId === sellerId);
  if (!mine.length) return { avg: 0, count: 0 };
  const avg =
    Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) /
    10;
  return { avg, count: mine.length };
}

export function formatSellerRatingLabel(avg: number, count: number): string {
  if (count <= 0) return "";
  const noun =
    count === 1 ? "atsiliepimas" : count < 10 ? "atsiliepimai" : "atsiliepimų";
  return `★ ${avg} (${count} ${noun})`;
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

/** Active auth (SMS / Apple / Google) + 5+ positive (4★+) reviews. */
export function isVerifiedTrustedSeller(
  sellerId: string,
  reviews: SellerReview[],
  authProvider?: AuthProvider | string | null,
  profile?: Pick<UserProfile, "authProvider" | "phone" | "email"> | null
): boolean {
  const provider =
    authProvider ||
    profile?.authProvider ||
    (profile?.phone ? "phone" : profile?.email ? "google" : null);
  const hasActiveAuth =
    provider === "phone" ||
    provider === "apple" ||
    provider === "google" ||
    Boolean(profile?.phone);
  if (!hasActiveAuth) return false;
  const positive = reviews.filter(
    (r) => r.sellerId === sellerId && r.rating >= 4
  ).length;
  return positive >= 5;
}
