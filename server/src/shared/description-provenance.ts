/**
 * Description provenance authority (reused across both SELL pipelines).
 *
 * Reuses the Universal Fact-Evidence `FactEvidenceSource` semantics. Pass-2
 * model prose is MODEL_INFERENCE — a non-canonical PROPOSAL. It must be
 * explicitly promoted (user edit/acceptance → USER_CORRECTION) before it may
 * become canonical listing content.
 *
 * SERVER-BOUND PROVENANCE (R2.4): the MODEL_INFERENCE classification is also
 * minted as an HMAC-bound token keyed to the exact description, reusing the
 * repository's existing signing authority (BULK_PROPOSAL_SECRET → JWT_SECRET).
 * The browser may transport the token but cannot forge or alter its meaning,
 * and cannot relabel server-issued AI prose as ordinary user content. This is
 * NOT a second provenance system and does NOT touch the frozen Fact Core.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FactEvidenceSource } from "./fact-evidence.js";

const MODEL_INFERENCE_PREFIX = "vauto:model-inference:v1:";
const HUMAN_CONFIRMED_PREFIX = "vauto:human-confirmed:v1:";

/** True when the description is unpromoted model prose (must not publish canonically). */
export function isUnpromotedModelInference(source: unknown): boolean {
  return source === "MODEL_INFERENCE";
}

/**
 * A user edit/acceptance of AI-proposed content authorizes it. The edited
 * content becomes USER_CORRECTION (authoritative user fact), regardless of its
 * prior provenance.
 */
export function promoteDescriptionSourceForUserEdit(): FactEvidenceSource {
  return "USER_CORRECTION";
}

/**
 * Resolve the existing server signing authority. No new secret: reuses the same
 * chain already used by the bulk-proposal HMAC receipts (BULK_PROPOSAL_SECRET,
 * then the existing JWT_SECRET, then the dev fallback).
 */
export function resolveProvenanceSigningKey(): string {
  return (
    process.env.BULK_PROPOSAL_SECRET ||
    process.env.JWT_SECRET ||
    "vauto-dev-secret-change-in-production"
  );
}

/**
 * Mint an HMAC-bound MODEL_INFERENCE provenance token for an exact description.
 * The digest binds the provenance class + the exact text + a purpose/version
 * marker, so a client cannot forge it or apply it to a different description.
 */
export function signModelInferenceProposal(
  description: string,
  signingKey?: string
): string {
  return createHmac("sha256", signingKey ?? resolveProvenanceSigningKey())
    .update(MODEL_INFERENCE_PREFIX + description)
    .digest("hex");
}

/**
 * Constant-time verify that a token was minted for this exact description as
 * MODEL_INFERENCE.
 */
export function verifyModelInferenceProposal(
  description: string,
  token: string,
  signingKey?: string
): boolean {
  const expected = signModelInferenceProposal(description, signingKey);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type DescriptionPublishDecision =
  | "reject_unpromoted"
  | "reject_invalid"
  | "accept";

/**
 * Mint a server-issued HUMAN_CONFIRMED confirmation artifact bound to the exact
 * current description. Only an explicit whole-description acceptance event may
 * produce this — a generic publish click must not.
 */
export function signHumanConfirmedDescription(
  description: string,
  signingKey?: string
): string {
  return createHmac("sha256", signingKey ?? resolveProvenanceSigningKey())
    .update(HUMAN_CONFIRMED_PREFIX + description)
    .digest("hex");
}

/** Constant-time verify a HUMAN_CONFIRMED artifact against the exact description. */
export function verifyHumanConfirmedDescription(
  description: string,
  token: string,
  signingKey?: string
): boolean {
  const expected = signHumanConfirmedDescription(description, signingKey);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The single authoritative publish decision for a description + its optional
 * server-issued artifacts:
 *   - valid HUMAN_CONFIRMED artifact (exact text) → accept;
 *   - stale/tampered confirmation artifact          → reject_invalid;
 *   - valid MODEL_INFERENCE provenance, unconfirmed → reject_unpromoted;
 *   - tampered MODEL_INFERENCE provenance          → reject_invalid;
 *   - no artifacts (manual user content)           → accept.
 * The browser-provided `descriptionSource` label is NEVER consulted.
 */
export function resolveDescriptionPublishDecision(
  description: string,
  provenanceToken: string | null | undefined,
  confirmationToken?: string | null,
  signingKey?: string
): DescriptionPublishDecision {
  if (confirmationToken) {
    return verifyHumanConfirmedDescription(description, confirmationToken, signingKey)
      ? "accept"
      : "reject_invalid";
  }
  if (provenanceToken) {
    return verifyModelInferenceProposal(description, provenanceToken, signingKey)
      ? "reject_unpromoted"
      : "reject_invalid";
  }
  return "accept";
}

/**
 * Description merge precedence (Fact-Evidence semantics): USER_CORRECTION
 * (user-authored) is authoritative over MODEL_INFERENCE (AI proposal). A new
 * AI regeneration must not silently overwrite a user-edited description.
 */
export function resolveUserDescriptionPrecedence(input: {
  previousSource: FactEvidenceSource | undefined;
  previousDescription: string | undefined;
  nextDescription: string;
  nextSource: FactEvidenceSource | undefined;
}): { description: string; source: FactEvidenceSource | undefined } {
  const prev = String(input.previousDescription ?? "").trim();
  if (input.previousSource === "USER_CORRECTION" && prev) {
    return { description: prev, source: "USER_CORRECTION" };
  }
  return { description: input.nextDescription, source: input.nextSource };
}

/**
 * Human authority over the description is established by EITHER a user edit
 * (USER_CORRECTION) OR a valid server-issued HUMAN_CONFIRMED confirmation
 * token. Fresh MODEL_INFERENCE regeneration must not overwrite either.
 */
export function isHumanAuthoritativeDescription(input: {
  source: FactEvidenceSource | undefined;
  confirmationToken: string | null | undefined;
}): boolean {
  return input.source === "USER_CORRECTION" || Boolean(input.confirmationToken);
}
