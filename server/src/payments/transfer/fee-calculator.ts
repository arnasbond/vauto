/**
 * Deterministic platform fee split — integer EUR cents only.
 * Invariant: grossAmountCents === platformFeeCents + sellerNetCents
 *
 * Platform fee = 5% of gross (floor). Remainder → seller net.
 */

import type { FeeSplit } from "./types.js";

/** VAUTO marketplace fee percent (integer math). */
export const PLATFORM_FEE_PERCENT = 5 as const;

export function calculatePlatformFeeSplit(grossAmountCents: number): FeeSplit {
  if (!Number.isInteger(grossAmountCents) || grossAmountCents <= 0) {
    throw new Error("grossAmountCents must be a positive integer");
  }
  const platformFeeCents = Math.floor(
    (grossAmountCents * PLATFORM_FEE_PERCENT) / 100
  );
  const sellerNetCents = grossAmountCents - platformFeeCents;
  assertFeeSplitInvariant({
    grossAmountCents,
    platformFeeCents,
    sellerNetCents,
  });
  return { grossAmountCents, platformFeeCents, sellerNetCents };
}

export function assertFeeSplitInvariant(split: FeeSplit): void {
  if (
    !Number.isInteger(split.grossAmountCents) ||
    !Number.isInteger(split.platformFeeCents) ||
    !Number.isInteger(split.sellerNetCents)
  ) {
    throw new Error("fee_split_must_be_integer_cents");
  }
  if (
    split.grossAmountCents !==
    split.platformFeeCents + split.sellerNetCents
  ) {
    throw new Error(
      `fee_split_invariant_violated: ${split.grossAmountCents} !== ${split.platformFeeCents}+${split.sellerNetCents}`
    );
  }
  if (split.platformFeeCents < 0 || split.sellerNetCents < 0) {
    throw new Error("fee_split_negative");
  }
}
