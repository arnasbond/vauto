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
      (Array.isArray(attrs.size) ? attrs.size[0] : attrs.size)?.toString() ||
      undefined,
  };
}

/** Real buyer measurements only — no invented default size. */
export function buyerMeasurementsFromProfile(
  user: UserProfile
): BodyMeasurements | null {
  const m = user.bodyMeasurements;
  if (!m) return null;
  const hasSize = Boolean(String(m.usualSize ?? "").trim());
  const hasCm = [m.bustCm, m.waistCm, m.hipsCm, m.heightCm].some(
    (n) => typeof n === "number" && n > 0
  );
  if (!hasSize && !hasCm) return null;
  return m;
}

export function hasGarmentFitData(
  garment: ReturnType<typeof garmentMeasurementsFromDraft>
): boolean {
  return Boolean(
    garment.sizeLabel ||
      garment.chestCm ||
      garment.waistCm ||
      garment.hipsCm ||
      garment.lengthCm
  );
}

function localFit(
  buyerName: string,
  listingTitle: string,
  buyer: BodyMeasurements,
  sizeLabel?: string
): MagicMirrorFit | null {
  const buyerSize = String(buyer.usualSize ?? "")
    .trim()
    .toUpperCase();
  const garmentSize = String(sizeLabel ?? "")
    .trim()
    .toUpperCase();
  if (!buyerSize || !garmentSize) return null;

  const first = buyerName.trim().split(/\s+/)[0] || "drauge";
  const item = listingTitle.trim() || "drabužis";
  if (buyerSize === garmentSize) {
    return {
      fitScore: 96,
      verdict: "ideal",
      recommendation: `${first}, pagal tavo dydį ${buyerSize} šis ${item} turėtų tikti.`,
    };
  }
  return {
    fitScore: 78,
    verdict: "good",
    recommendation: `${first}, dydis ${garmentSize} (tavo: ${buyerSize}) — patikrink matmenis pokalbyje su pardavėju.`,
  };
}

/**
 * Returns null when buyer or garment data is insufficient — callers must silent-hide.
 */
export async function analyzeMagicMirrorFit(params: {
  buyerName: string;
  listingTitle: string;
  buyerMeasurements: BodyMeasurements | null;
  garmentMeasurements: ReturnType<typeof garmentMeasurementsFromDraft>;
  listingDescription?: string;
}): Promise<MagicMirrorFit | null> {
  if (!params.buyerMeasurements || !hasGarmentFitData(params.garmentMeasurements)) {
    return null;
  }

  if (isAiProxyAvailable()) {
    const remote = await apiMagicMirrorFit({
      ...params,
      buyerMeasurements: params.buyerMeasurements,
    });
    if (remote) {
      if (remote.verdict === "unknown" || !(remote.fitScore > 0)) return null;
      return remote;
    }
  }

  return localFit(
    params.buyerName,
    params.listingTitle,
    params.buyerMeasurements,
    params.garmentMeasurements.sizeLabel
  );
}
