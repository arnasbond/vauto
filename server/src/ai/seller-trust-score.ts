import { getReviews } from "../repository.js";

export interface SellerTrustSummary {
  score: number;
  reviewCount: number;
  avgRating: number;
  recommendation: string;
}

/** Server-side trust broker — naudojamas agento getSellerTrustScore įrankiui. */
export async function buildSellerTrustSummary(params: {
  sellerId: string;
  sellerName?: string;
  buyerName?: string;
}): Promise<SellerTrustSummary> {
  const buyerFirst = params.buyerName?.trim().split(/\s+/)[0] || "drauge";
  const sellerFirst = params.sellerName?.trim().split(/\s+/)[0] || "pardavėjas";

  let reviews: Awaited<ReturnType<typeof getReviews>> = [];
  try {
    reviews = await getReviews();
  } catch {
    reviews = [];
  }

  const sellerReviews = reviews.filter((r) => r.sellerId === params.sellerId);
  const reviewCount = sellerReviews.length;

  if (!reviewCount) {
    return {
      score: 82,
      reviewCount: 0,
      avgRating: 0,
      recommendation: `${buyerFirst}, ${sellerFirst} dar neturi atsiliepimų — rekomenduoju pasitarti dėl siuntimo ir grąžinimo sąlygų prieš apmokėjimą.`,
    };
  }

  const avgRating =
    sellerReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviewCount;
  const score = Math.min(99, Math.max(55, Math.round(avgRating * 18 + Math.min(reviewCount, 12) * 1.5)));

  const recommendation =
    score >= 90
      ? `${buyerFirst}, ${sellerFirst} turi ${score}% AI pasitikėjimo balą (${reviewCount} atsiliepimai, vid. ${avgRating.toFixed(1)} žv.) — sandoris atrodo saugus.`
      : `${buyerFirst}, ${sellerFirst} turi ${score}% pasitikėjimo balą pagal ${reviewCount} atsiliepimus — verta pasitikrinti detales prieš sandorį.`;

  return {
    score,
    reviewCount,
    avgRating: Math.round(avgRating * 10) / 10,
    recommendation,
  };
}
