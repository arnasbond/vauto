/**
 * Vision Anti-Fraud Guard — image safety quarantine gate.
 * Stock / watermark judgments stay out of the Client → Gemini pipeline;
 * illegal-content / unavailable-check quarantine uses classifyImagesSafe (fail-closed in prod).
 */

import { classifyImagesSafe } from "./safety-shield.js";

export interface AntiFraudResult {
  isVerified: boolean;
  requiresReview: boolean;
  riskScore: number;
  reasons: string[];
  userNotice: string;
}

const SAFE_DEFAULT: AntiFraudResult = {
  isVerified: true,
  requiresReview: false,
  riskScore: 0,
  reasons: [],
  userNotice: "",
};

/**
 * Delegates to classifyImagesSafe. Production fail-closed:
 * unavailable checks → requiresReview (do not auto-publish).
 */
export async function runVisionAntiFraudGuard(
  imageDataUrls: string[],
  _listingContext?: { title?: string; category?: string }
): Promise<AntiFraudResult> {
  if (!imageDataUrls?.length) return SAFE_DEFAULT;
  const result = await classifyImagesSafe(imageDataUrls);
  if (result.safe && !result.requiresReview) return SAFE_DEFAULT;
  return {
    isVerified: false,
    requiresReview: true,
    riskScore: result.requiresReview ? 55 : 90,
    reasons: [result.reason || "unsafe"],
    userNotice: result.requiresReview
      ? "Vaizdų saugumo patikra nepasiekiama — skelbimas reikalauja peržiūros."
      : "Nuotrauka neatitinka saugumo reikalavimų.",
  };
}
