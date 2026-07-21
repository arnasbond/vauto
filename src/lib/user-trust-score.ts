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

function analyzeMessageTone(chats: ChatThread[], sellerId: string): number {
  const sellerMessages = chats
    .filter((c) => c.sellerId === sellerId)
    .flatMap((c) => c.messages.filter((m) => m.senderId === sellerId));

  if (!sellerMessages.length) return 88;

  let polite = 0;
  for (const msg of sellerMessages) {
    const lower = msg.text.toLowerCase();
    if (POLITE_MARKERS.some((w) => lower.includes(w))) polite += 1;
    if (msg.text.length >= 12 && !/[A-Z]{4,}/.test(msg.text)) polite += 0.3;
  }
  const ratio = polite / sellerMessages.length;
  return clamp(72 + ratio * 28);
}

function analyzeShippingSpeed(chats: ChatThread[], sellerId: string): {
  score: number;
  hoursAvg: number | null;
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
    return { score: 94, hoursAvg: 4 };
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
  const hoursAvg = count ? totalHours / count : 4;
  const score =
    hoursAvg <= 6 ? 99 : hoursAvg <= 24 ? 92 : hoursAvg <= 48 ? 82 : 70;
  return { score: clamp(score), hoursAvg: Math.round(hoursAvg * 10) / 10 };
}

/** AI Trust Score Broker — elgsena, atsiliepimai, siuntimo greitis. */
export function buildUserTrustScore(input: {
  sellerId: string;
  sellerName: string;
  reviews: SellerReview[];
  chats: ChatThread[];
  listings?: Listing[];
}): UserTrustProfile {
  const { avg, count } = computeSellerRating(input.reviews, input.sellerId);
  const reviewScore = count ? clamp((avg / 5) * 100) : 90;
  const { score: shippingScore, hoursAvg } = analyzeShippingSpeed(
    input.chats,
    input.sellerId
  );
  const toneScore = analyzeMessageTone(input.chats, input.sellerId);

  const score = clamp(reviewScore * 0.4 + shippingScore * 0.35 + toneScore * 0.25);

  const first = getFirstName(input.sellerName);
  const shippingLine =
    hoursAvg !== null && hoursAvg <= 12
      ? "siuntas išsiunčia per kelias valandas"
      : "sandoriai vyksta sklandžiai";
  const recommendation = `${first} turi ${score}% AI pasitikėjimo balą: ${shippingLine}, sandoris visiškai saugus.`;

  return {
    score,
    reviewScore,
    shippingScore,
    toneScore,
    shippingHoursAvg: hoursAvg,
    reviewCount: count,
    recommendation,
  };
}

export function resolveSellerDisplayName(
  sellerId: string,
  listings: Listing[],
  fallback = "Pardavėjas"
): string {
  const listing = listings.find((l) => l.sellerId === sellerId);
  return sellerDisplayName(sellerId, { listing }) || fallback;
}
