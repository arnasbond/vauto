/**
 * Seller trust — verified identity, account age, transactions, deliveries, disputes.
 * NO HISTORY ≠ BAD HISTORY: new sellers are neutral (null / limited), not punished.
 * Forbidden inputs: name, gender, age, ethnicity, social status (not accepted in type).
 */

import type { ReasonCode, ScoreComponent, SellerTrustInput } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function scoreSellerTrust(seller: SellerTrustInput | null | undefined): {
  component: ScoreComponent;
  missing: string[];
} {
  const weight = SCORE_WEIGHTS.sellerTrust;
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];

  if (!seller) {
    missing.push("seller");
    reasons.push("SELLER_SIGNALS_MISSING");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  const hasVerified = seller.identityVerified != null;
  const hasAge = seller.accountAgeDays != null && Number.isFinite(seller.accountAgeDays);
  const hasTx =
    seller.completedTransactions != null &&
    Number.isFinite(seller.completedTransactions);
  const hasDelivery =
    seller.successfulDeliveries != null &&
    Number.isFinite(seller.successfulDeliveries);
  const hasDispute =
    seller.disputeRate != null && Number.isFinite(seller.disputeRate);

  const isNew =
    seller.isNewSeller === true ||
    (hasTx && seller.completedTransactions === 0 && (seller.accountAgeDays ?? 0) < 30);

  // Brand-new seller with only "new" flag and nothing else → N/A (neutral), not a low score
  if (isNew && !hasVerified && !hasDispute && !hasDelivery) {
    reasons.push("NEW_SELLER_NO_HISTORY");
    // If we at least know they are new / age — still N/A for trust score (don't punish)
    if (!hasVerified && !hasTx && !hasDispute) {
      missing.push("seller.history");
      return {
        component: {
          score: null,
          weight,
          confidence: 0.15,
          reasonCodes: reasons,
        },
        missing,
      };
    }
  }

  if (!hasVerified && !hasAge && !hasTx && !hasDelivery && !hasDispute) {
    missing.push("seller");
    reasons.push("SELLER_SIGNALS_MISSING");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  const parts: number[] = [];

  if (hasVerified) {
    if (seller.identityVerified) {
      parts.push(92);
      reasons.push("VERIFIED_SELLER");
    } else {
      parts.push(55);
      reasons.push("UNVERIFIED_SELLER");
    }
  } else {
    missing.push("seller.identityVerified");
  }

  if (hasAge) {
    const days = Math.max(0, seller.accountAgeDays!);
    if (days >= 365) {
      parts.push(90);
      reasons.push("ESTABLISHED_ACCOUNT");
    } else if (days >= 90) {
      parts.push(75);
      reasons.push("ESTABLISHED_ACCOUNT");
    } else if (isNew || days < 30) {
      // New account age alone does NOT push score down — skip contributing a penalty part
      reasons.push("NEW_SELLER_NO_HISTORY");
    } else {
      parts.push(65);
    }
  } else {
    missing.push("seller.accountAgeDays");
  }

  if (hasTx) {
    const tx = Math.max(0, seller.completedTransactions!);
    if (tx === 0) {
      reasons.push("NEW_SELLER_NO_HISTORY");
      // Do not add a low score part — missing history is neutral
    } else if (tx < 3) {
      parts.push(62);
      reasons.push("LIMITED_TRANSACTION_HISTORY");
    } else if (tx < 15) {
      parts.push(80);
      reasons.push("SOLID_TRANSACTION_HISTORY");
    } else {
      parts.push(95);
      reasons.push("SOLID_TRANSACTION_HISTORY");
    }
  } else {
    missing.push("seller.completedTransactions");
  }

  if (hasDelivery) {
    const d = Math.max(0, seller.successfulDeliveries!);
    if (d >= 5) {
      parts.push(90);
      reasons.push("RELIABLE_DELIVERY_RECORD");
    } else if (d >= 1) {
      parts.push(72);
      reasons.push("RELIABLE_DELIVERY_RECORD");
    }
  } else {
    missing.push("seller.successfulDeliveries");
  }

  if (hasDispute) {
    const rate = Math.min(1, Math.max(0, seller.disputeRate!));
    if (rate <= 0.05) {
      parts.push(95);
      reasons.push("LOW_DISPUTE_RATE");
    } else if (rate <= 0.15) {
      parts.push(70);
      reasons.push("ELEVATED_DISPUTE_RATE");
    } else {
      parts.push(35);
      reasons.push("ELEVATED_DISPUTE_RATE");
    }
  } else {
    missing.push("seller.disputeRate");
  }

  if (parts.length === 0) {
    // Only neutral new-seller signals — N/A
    if (!reasons.includes("NEW_SELLER_NO_HISTORY")) {
      reasons.push("NEW_SELLER_NO_HISTORY");
    }
    return {
      component: {
        score: null,
        weight,
        confidence: 0.2,
        reasonCodes: [...new Set(reasons)],
      },
      missing,
    };
  }

  const score = clampScore(parts.reduce((a, b) => a + b, 0) / parts.length);
  const confidence = Math.min(1, 0.25 + parts.length * 0.15);

  return {
    component: {
      score,
      weight,
      confidence,
      reasonCodes: [...new Set(reasons)],
    },
    missing,
  };
}
