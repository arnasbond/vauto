/**
 * Transaction confidence — Omniva, Escrow, buyer protection availability.
 */

import type { ReasonCode, ScoreComponent, TransactionConfidenceInput } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function scoreTransactionConfidence(
  tx: TransactionConfidenceInput | null | undefined
): {
  component: ScoreComponent;
  missing: string[];
} {
  const weight = SCORE_WEIGHTS.transactionConfidence;
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];

  if (!tx) {
    missing.push("transaction");
    reasons.push("TRANSACTION_SIGNALS_MISSING");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  const flags: Array<[keyof TransactionConfidenceInput, ReasonCode, number]> = [
    ["escrowAvailable", "ESCROW_AVAILABLE", 40],
    ["omnivaAvailable", "OMNIVA_AVAILABLE", 30],
    ["buyerProtectionAvailable", "BUYER_PROTECTION_AVAILABLE", 30],
  ];

  let known = 0;
  let points = 0;
  let availableCount = 0;

  for (const [key, code, pts] of flags) {
    const v = tx[key];
    if (v == null) {
      missing.push(`transaction.${key}`);
      continue;
    }
    known += 1;
    if (v === true) {
      points += pts;
      availableCount += 1;
      reasons.push(code);
    }
  }

  if (known === 0) {
    reasons.push("TRANSACTION_SIGNALS_MISSING");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  // Scale known flags to 0–100 (max points among known)
  const maxPoints = flags
    .filter(([key]) => tx[key] != null)
    .reduce((s, [, , pts]) => s + pts, 0);
  const score = clampScore(maxPoints > 0 ? (points / maxPoints) * 100 : 0);

  if (availableCount === 0) reasons.push("NO_PROTECTION_OPTIONS");
  else if (availableCount < known) reasons.push("LIMITED_PROTECTION_OPTIONS");

  return {
    component: {
      score,
      weight,
      confidence: known / 3,
      reasonCodes: [...new Set(reasons)],
    },
    missing,
  };
}
