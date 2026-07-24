/**
 * Omniva pastomatas gatekeeper — thin adapter over shared eligibility fence.
 * Max L locker: 39×38×64 cm, 30 kg.
 */

import {
  OMNIVA_OVERSIZE_BLOCK_MESSAGE,
  resolveOmnivaLockerEligibility,
} from "../shared/omniva-locker-eligibility.js";

export type OmnivaGatekeeperResult =
  | { oversized: false }
  | { oversized: true; reason: string };

export function evaluateOmnivaPastomatasGatekeeper(input: {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, unknown>;
  allowPastomatas?: boolean;
}): OmnivaGatekeeperResult {
  const eligibility = resolveOmnivaLockerEligibility(input);
  if (eligibility.eligible) return { oversized: false };
  return {
    oversized: true,
    reason: eligibility.reason ?? "prekė netinka Omniva paštomatui",
  };
}

export { OMNIVA_OVERSIZE_BLOCK_MESSAGE };
