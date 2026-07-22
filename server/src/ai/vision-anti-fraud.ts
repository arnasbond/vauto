/**
 * Vision Anti-Fraud Guard — DISABLED (domain-bounded autonomy).
 * Stock / watermark / “inadequate photo” judgments must not block the unified
 * Client → Gemini pipeline. Illegal-content moderation stays in listing-moderation.
 */

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
 * No-op: always allow. Kept as a stable export so call sites compile without
 * reintroducing stock-photo rejection.
 */
export async function runVisionAntiFraudGuard(
  _imageDataUrls: string[],
  _listingContext?: { title?: string; category?: string }
): Promise<AntiFraudResult> {
  return SAFE_DEFAULT;
}
