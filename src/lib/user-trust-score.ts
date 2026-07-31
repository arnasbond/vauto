import { computeSellerRating } from "@/lib/reviews";
import type { ChatThread, Listing, SellerReview } from "@/lib/types";
import { getFirstName } from "@/lib/buddy-voice";
import { sellerDisplayName } from "@/lib/seller-display";

export interface UserTrustProfile {
  score: number;
  reviewScore: number;
  shippingScore: number;
  toneScore: number;
  shippingHoursAvg: number | null;
  reviewCount: number;
  recommendation: string;
}

const POLITE_MARKERS = [
  "ačiū",
  "aciu",
  "labas",
  "sveiki",
  "malonu",
  "gražu",
  "grazu",
  "puiku",
  "gerai",
  "suprantu",
  "žinoma",
  "zinoma",
];

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function analyzeMessageTone(
  chats: ChatThread[],
  sellerId: string
): { score: number; sampleCount: number } {
  const sellerMessages = chats
    .filter((c) => c.sellerId === sellerId)
    .flatMap((c) => c.messages.filter((m) => m.senderId === sellerId));

  if (!sellerMessages.length) return { score: 0, sampleCount: 0 };

  let polite = 0;
  for (const msg of sellerMessages) {
    const lower = msg.text.toLowerCase();
    if (POLITE_MARKERS.some((w) => lower.includes(w))) polite += 1;
    if (msg.text.length >= 12 && !/[A-Z]{4,}/.test(msg.text)) polite += 0.3;
  }
  const ratio = polite / sellerMessages.length;
  return {
    score: clamp(72 + ratio * 28),
    sampleCount: sellerMessages.length,
  };
}

function analyzeShippingSpeed(chats: ChatThread[], sellerId: string): {
  score: number;
  hoursAvg: number | null;
  sampleCount: number;
} {
  const escrows = chats
    .filter((c) => c.sellerId === sellerId && c.escrow)
    .map((c) => c.escrow!);

  const shipped = escrows.filter(
    (e) =>
      e.deliveredToLockerAt &&
      (e.status === "delivered" || e.status === "completed")
  );

  if (!shipped.length) {
    return { score: 0, hoursAvg: null, sampleCount: 0 };
  }

  let totalHours = 0;
  let count = 0;
  for (const e of shipped) {
    const start = new Date(e.createdAt).getTime();
    const end = new Date(e.deliveredToLockerAt!).getTime();
    if (end > start) {
      totalHours += (end - start) / 3_600_000;
      count += 1;
    }
  }
  const hoursAvg = count ? totalHours / count : null;
  const score =
    hoursAvg == null
      ? 0
      : hoursAvg <= 6
        ? 99
        : hoursAvg <= 24
          ? 92
          : hoursAvg <= 48
            ? 82
            : 70;
  return {
    score: clamp(score),
    hoursAvg: hoursAvg != null ? Math.round(hoursAvg * 10) / 10 : null,
    sampleCount: count,
  };
}

/** True when we have real reviews or shipping samples — otherwise hide the banner. */
export function hasEnoughTrustEvidence(profile: UserTrustProfile): boolean {
  return profile.reviewCount >= 1 || (profile.shippingHoursAvg != null && profile.shippingScore > 0);
}

/** AI Trust Score Broker — elgsena, atsiliepimai, siuntimo greitis. */
export function buildUserTrustScore(input: {
  sellerId: string;
  sellerName: string;
  reviews: SellerReview[];
  chats: ChatThread[];
  listings?: Listing[];
}): UserTrustProfile | null {
  const { avg, count } = computeSellerRating(input.reviews, input.sellerId);
  const shipping = analyzeShippingSpeed(input.chats, input.sellerId);
  const tone = analyzeMessageTone(input.chats, input.sellerId);

  // Silent hide — no invented 90%/94% defaults without evidence.
  if (count < 1 && shipping.sampleCount < 1) {
    return null;
  }

  const reviewScore = count ? clamp((avg / 5) * 100) : 0;
  const shippingScore = shipping.sampleCount ? shipping.score : 0;
  const toneScore = tone.sampleCount ? tone.score : 0;

  let score: number;
  if (count >= 1 && shipping.sampleCount >= 1) {
    score = clamp(
      reviewScore * 0.5 +
        shippingScore * 0.35 +
        (tone.sampleCount ? toneScore * 0.15 : 0)
    );
  } else if (count >= 1) {
    score = clamp(reviewScore * 0.85 + (tone.sampleCount ? toneScore * 0.15 : 0));
  } else {
    score = clamp(shippingScore);
  }

  const first = getFirstName(input.sellerName);
  const shippingLine =
    shipping.hoursAvg !== null && shipping.hoursAvg <= 12
      ? "siuntas išsiunčia greitai"
      : count >= 1
        ? `turi ${count} atsiliepimą(-us)`
        : "yra siuntimo istorija";
  const recommendation = `${first}: ${score}% AI pasitikėjimo balas pagal realius duomenis (${shippingLine}).`;

  const profile: UserTrustProfile = {
    score,
    reviewScore: reviewScore || score,
    shippingScore: shippingScore || score,
    toneScore: toneScore || score,
    shippingHoursAvg: shipping.hoursAvg,
    reviewCount: count,
    recommendation,
  };
  return hasEnoughTrustEvidence(profile) ? profile : null;
}

export function resolveSellerDisplayName(
  sellerId: string,
  listings: Listing[],
  fallback = "Pardavėjas"
): string {
  const listing = listings.find((l) => l.sellerId === sellerId);
  return sellerDisplayName(sellerId, { listing }) || fallback;
}
