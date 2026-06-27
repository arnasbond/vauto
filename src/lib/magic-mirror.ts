import { apiMagicMirrorFit } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import type { AiExtractedListing, BodyMeasurements, Listing, UserProfile } from "@/lib/types";

export interface MagicMirrorFit {
  fitScore: number;
  verdict: "ideal" | "good" | "tight" | "loose" | "unknown";
  recommendation: string;
  sellerTip?: string;
}

function parseNum(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s?.trim()) return undefined;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function garmentMeasurementsFromDraft(
  draft: AiExtractedListing | Listing
): {
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  lengthCm?: number;
  sizeLabel?: string;
} {
  const attrs = draft.attributes ?? {};
  return {
    chestCm: parseNum(attrs.chestCm),
    waistCm: parseNum(attrs.waistCm),
    hipsCm: parseNum(attrs.hipsCm),
    lengthCm: parseNum(attrs.lengthCm),
    sizeLabel:
      (Array.isArray(attrs.size) ? attrs.size[0] : attrs.size)?.toString() || undefined,
  };
}

export function buyerMeasurementsFromProfile(user: UserProfile): BodyMeasurements {
  return user.bodyMeasurements ?? { usualSize: "M" };
}

function localFit(
  buyerName: string,
  listingTitle: string,
  buyer: BodyMeasurements,
  sizeLabel?: string
): MagicMirrorFit {
  const first = buyerName.trim().split(/\s+/)[0] || "drauge";
  const item = listingTitle.trim() || "švarkelis";
  const buyerSize = (buyer.usualSize ?? "M").toUpperCase();
  const garmentSize = (sizeLabel ?? "M").toUpperCase();
  if (buyerSize === garmentSize) {
    return {
      fitScore: 96,
      verdict: "ideal",
      recommendation: `${first}, pagal tavo figūrą šis ${item} tiks idealiai.`,
    };
  }
  return {
    fitScore: 78,
    verdict: "good",
    recommendation: `${first}, dydis ${garmentSize} gali tikti — rekomenduoju pasitikrinti matmenis pokalbyje.`,
  };
}

export async function analyzeMagicMirrorFit(params: {
  buyerName: string;
  listingTitle: string;
  buyerMeasurements: BodyMeasurements;
  garmentMeasurements: ReturnType<typeof garmentMeasurementsFromDraft>;
  listingDescription?: string;
}): Promise<MagicMirrorFit> {
  if (isAiProxyAvailable()) {
    const remote = await apiMagicMirrorFit(params);
    if (remote) return remote;
  }
  return localFit(
    params.buyerName,
    params.listingTitle,
    params.buyerMeasurements,
    params.garmentMeasurements.sizeLabel
  );
}
