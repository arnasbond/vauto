/**
 * VAUTO AI Maturity — Phase 2C Round 3: SERVER-OWNED VIN confirmation authority.
 *
 * The browser is never an authority source. A VIN persists only when:
 *   - it is verified as the ORIGINAL persisted DB VIN (unchanged PATCH), or
 *   - it carries a valid server-minted HMAC confirmation receipt.
 *
 * Receipt lifecycle:
 *   1. Minted ONLY after an explicit structured confirmation request at an
 *      authenticated server boundary (POST /api/vin-review/confirm, or the
 *      server-side VIN reducer during an authenticated agent turn).
 *   2. Bound to: purpose, authenticated user ID, optional listing ID, exact
 *      normalized VIN, exact current reviewId, issuance time, bounded expiry.
 *   3. Travels only through trusted channels (client side-effect/request); it is
 *      stripped from every LLM-visible tool result (see UNTRUSTED_VIN_MARKER_KEYS).
 *   4. Verified at the final server persistence boundary
 *      (finalizeCreateVinAuthority / finalizePatchVinAuthority).
 *   5. Becomes invalid when user, listing, VIN, reviewId, purpose or lifetime
 *      mismatches; forged values fail verification and result in VIN omission.
 *
 * Never log full VIN values or receipts.
 */

import crypto from "node:crypto";
import { isPlausibleVin, normalizeVin } from "../shared/vin-utils.js";
import {
  VIN_CONFIRMATION_ATTR_KEYS,
  VIN_REVIEW_EPHEMERAL_ATTR_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
} from "../shared/vin-review.js";
import { sanitizeListingAttributesForPersistence } from "../shared/listing-attributes-sanitize.js";
import { verifyConfirmedVinChallenge, verifyVinDraftScope } from "./vin-challenge.js";

const VIN_CONFIRM_PURPOSE = "vin_confirm_v1";

const DEFAULT_VIN_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

/** Known weak default — forbidden in production (mirrors auth/tokens.ts policy). */
export const DEV_JWT_SECRET = "vauto-dev-secret-change-in-production";

function resolveConfirmationSecret(): string {
  const fromEnv = process.env.VIN_CONFIRM_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!fromEnv || fromEnv === DEV_JWT_SECRET) {
      throw new Error(
        "VIN confirmation requires a strong non-default server secret in production"
      );
    }
    return fromEnv;
  }
  return fromEnv || DEV_JWT_SECRET;
}

function ttlMs(): number {
  const raw = Number(process.env.VIN_CONFIRM_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VIN_CONFIRM_TTL_MS;
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function receiptPayload(input: {
  userId: string;
  listingId?: string;
  draftScope?: string;
  vin: string;
  reviewId: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  return [
    VIN_CONFIRM_PURPOSE,
    input.userId,
    input.listingId ?? "",
    input.draftScope ?? "",
    input.vin,
    input.reviewId,
    String(input.issuedAt),
    String(input.expiresAt),
  ].join("|");
}

export interface VinConfirmationAttrs {
  vinConfirmationReceipt: string;
  vinConfirmationIssuedAt: string;
  vinConfirmationExpiresAt: string;
}

export type VinConfirmationVerifyReason =
  | "missing_receipt"
  | "tampered"
  | "expired"
  | "wrong_user"
  | "wrong_listing"
  | "wrong_vin"
  | "wrong_review_id"
  | "invalid_metadata";

export type VinConfirmationVerifyResult =
  | { ok: true; vin: string }
  | { ok: false; reason: VinConfirmationVerifyReason };

/**
 * Mint server-owned confirmation authority for an explicit human confirmation.
 * Returns the receipt attributes to attach to the draft.
 */
export function mintVinConfirmation(input: {
  userId: string;
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  nowMs?: number;
  ttlOverrideMs?: number;
}): VinConfirmationAttrs | null {
  const vin = normalizeVin(input.vin ?? "");
  if (!isPlausibleVin(vin)) return null;
  const reviewId = String(input.reviewId ?? "").trim();
  if (!reviewId) return null;
  const userId = String(input.userId ?? "").trim();
  if (!userId) return null;

  const issuedAt = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const expiresAt =
    Math.floor((input.nowMs ?? Date.now()) / 1000) +
    Math.floor((input.ttlOverrideMs ?? ttlMs()) / 1000);

  const secret = resolveConfirmationSecret();
  const receipt = hmacHex(
    secret,
    receiptPayload({
      userId,
      listingId: input.listingId?.trim() || undefined,
      draftScope: input.draftScope?.trim() || undefined,
      vin,
      reviewId,
      issuedAt,
      expiresAt,
    })
  );

  return {
    vinConfirmationReceipt: receipt,
    vinConfirmationIssuedAt: String(issuedAt),
    vinConfirmationExpiresAt: String(expiresAt),
  };
}

/**
 * Verify server-owned confirmation authority. Constant-time HMAC comparison;
 * all bindings (user, listing, draft scope, VIN, reviewId, purpose, lifetime)
 * must match.
 */
export function verifyVinConfirmation(input: {
  userId: string;
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  receipt: string;
  issuedAt: string;
  expiresAt: string;
  nowMs?: number;
}): VinConfirmationVerifyResult {
  const vin = normalizeVin(input.vin ?? "");
  if (!isPlausibleVin(vin)) return { ok: false, reason: "wrong_vin" };
  const receipt = String(input.receipt ?? "").trim();
  if (!receipt) return { ok: false, reason: "missing_receipt" };

  const issuedAt = Number(String(input.issuedAt ?? "").trim());
  const expiresAt = Number(String(input.expiresAt ?? "").trim());
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "invalid_metadata" };
  }
  if (issuedAt <= 0 || expiresAt <= issuedAt) {
    return { ok: false, reason: "invalid_metadata" };
  }
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (expiresAt <= nowSec) return { ok: false, reason: "expired" };
  if (issuedAt > nowSec + 60) return { ok: false, reason: "invalid_metadata" };

  const secret = resolveConfirmationSecret();
  const expected = hmacHex(
    secret,
    receiptPayload({
      userId: input.userId,
      listingId: input.listingId?.trim() || undefined,
      draftScope: input.draftScope?.trim() || undefined,
      vin,
      reviewId: String(input.reviewId ?? "").trim(),
      issuedAt,
      expiresAt,
    })
  );
  const a = Buffer.from(receipt, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "tampered" };
  }
  return { ok: true, vin };
}

const AUTHORITY_STRIP_KEYS: ReadonlyArray<string> = [
  ...VIN_REVIEW_EPHEMERAL_ATTR_KEYS,
  ...VIN_CONFIRMATION_ATTR_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
  // The shape sanitizer deliberately lets this reach the boundary for receipt
  // verification — the finalizer must strip it before persistence.
  "vinConfirmedReviewId",
];

function stripAuthorityKeys(
  attrs: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = { ...attrs };
  for (const key of AUTHORITY_STRIP_KEYS) delete out[key];
  return out;
}

function pendingReviewMarkers(attrs: Record<string, unknown>): boolean {
  return (
    Boolean(String(attrs.vinCandidate ?? "").trim()) ||
    (String(attrs.vinConflict ?? "").trim() === "true" &&
      Boolean(String(attrs.vinConflictValue ?? "").trim()))
  );
}

function reviewIdOf(attrs: Record<string, unknown>): string {
  return String(attrs.vinConfirmedReviewId ?? "").trim();
}

function shapeSanitize(
  raw: Record<string, string | string[] | undefined> | undefined
): Record<string, string | string[] | undefined> {
  return sanitizeListingAttributesForPersistence(raw ?? {});
}

/**
 * POST /api/listings (create): the ONLY acceptable VIN authority is a valid
 * server-minted confirmation receipt bound to a server-confirmed, non-superseded
 * challenge. Pending candidate/conflict markers are read from the RAW payload
 * (the shape sanitizer strips them) and always result in omission.
 */
export function finalizeCreateVinAuthority(
  rawAttrs: Record<string, string | string[] | undefined> | undefined,
  userId: string
): Record<string, string | string[] | undefined> {
  const raw = (rawAttrs ?? {}) as Record<string, string | string[] | undefined>;
  const out = stripAuthorityKeys(shapeSanitize(raw));
  const vin = normalizeVin(String(raw.vin ?? ""));
  if (!isPlausibleVin(vin)) {
    delete out.vin;
    return out;
  }
  if (pendingReviewMarkers(raw as Record<string, unknown>)) {
    delete out.vin;
    return out;
  }
  const challengeId = String(raw.vinChallenge ?? "").trim();
  const draftScope = String(raw.vinDraftScope ?? "").trim();
  const reviewId = reviewIdOf(raw as Record<string, unknown>);
  // The draft scope must be SERVER-OWNED: verified against the scope store
  // (existence, user binding, lifetime) before any receipt is accepted.
  const scope = draftScope ? verifyVinDraftScope(userId, draftScope) : null;
  if (draftScope && (!scope || !scope.ok)) {
    delete out.vin;
    return out;
  }
  const verified = verifyVinConfirmation({
    userId,
    vin,
    reviewId,
    draftScope: draftScope || undefined,
    receipt: String(raw.vinConfirmationReceipt ?? ""),
    issuedAt: String(raw.vinConfirmationIssuedAt ?? ""),
    expiresAt: String(raw.vinConfirmationExpiresAt ?? ""),
  });
  if (!verified.ok) {
    delete out.vin;
    return out;
  }
  const challenge = verifyConfirmedVinChallenge({
    challengeId,
    userId,
    vin,
    reviewId,
    draftScope: draftScope || undefined,
  });
  if (!challenge.ok) {
    delete out.vin;
    return out;
  }
  out.vin = verified.vin;
  return out;
}

/**
 * PATCH /api/listings/:id: authority is either the ORIGINAL persisted DB VIN
 * (unchanged incoming VIN) or a valid server-minted receipt bound to THIS
 * listing. An incoming replacement VIN must never inherit `existing_confirmed`.
 */
export function finalizePatchVinAuthority(
  rawAttrs: Record<string, string | string[] | undefined> | undefined,
  ctx: {
    userId: string;
    listingId: string;
    existingVin: string | string[] | undefined;
    /** The patch explicitly cleared the VIN field (empty/null value). */
    vinClearedByPatch?: boolean;
  }
): Record<string, string | string[] | undefined> {
  const raw = (rawAttrs ?? {}) as Record<string, string | string[] | undefined>;
  const out = stripAuthorityKeys(shapeSanitize(raw));
  const incomingVin = normalizeVin(String(raw.vin ?? ""));
  const existingVin = normalizeVin(String(ctx.existingVin ?? ""));

  // 0. Explicit clear → the VIN is removed; nothing may resurrect it.
  if (ctx.vinClearedByPatch) {
    delete out.vin;
    return out;
  }

  const existingPlausible = isPlausibleVin(existingVin);
  const incomingPlausible = isPlausibleVin(incomingVin);

  // 1. Unchanged original persisted VIN → preserve verified DB authority.
  if (existingPlausible && incomingPlausible && incomingVin === existingVin) {
    out.vin = existingVin;
    return out;
  }

  // 2. Replacement/cleared/unconfirmed → must carry a valid receipt bound to
  //    this user + listing + VIN + reviewId AND a confirmed, non-superseded
  //    challenge.
  if (incomingPlausible && !pendingReviewMarkers(raw as Record<string, unknown>)) {
    const verified = verifyVinConfirmation({
      userId: ctx.userId,
      vin: incomingVin,
      reviewId: reviewIdOf(raw as Record<string, unknown>),
      listingId: ctx.listingId,
      receipt: String(raw.vinConfirmationReceipt ?? ""),
      issuedAt: String(raw.vinConfirmationIssuedAt ?? ""),
      expiresAt: String(raw.vinConfirmationExpiresAt ?? ""),
    });
    if (verified.ok) {
      const challenge = verifyConfirmedVinChallenge({
        challengeId: String(raw.vinChallenge ?? "").trim(),
        userId: ctx.userId,
        vin: incomingVin,
        reviewId: reviewIdOf(raw as Record<string, unknown>),
        listingId: ctx.listingId,
      });
      if (challenge.ok) {
        out.vin = verified.vin;
        return out;
      }
    }
  }

  // 3. Anything else (changed/cleared/forged/candidate/conflict) → VIN omitted:
  //    the replacement must run through fresh server-verified confirmation.
  delete out.vin;
  return out;
}

/** Test-only seam: force a deterministic secret/TTL for adversarial tests. */
export function __vinConfirmationTestSecrets(secret?: string): string {
  if (secret !== undefined) process.env.VIN_CONFIRM_SECRET = secret;
  return resolveConfirmationSecret();
}

/**
 * Server-computed attribute patch for a successful confirmation: canonical VIN,
 * confirmation record bound to the server-owned review generation, a fresh HMAC
 * receipt, the consumed challenge id (kept for publish-boundary re-verification)
 * and every pending marker cleared. Used by both the confirmation endpoint and
 * the agent's server-side confirm turn.
 */
export function buildConfirmedVinAttributesPatch(input: {
  userId: string;
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  challengeId: string;
}): Record<string, string> | null {
  const receipt = mintVinConfirmation(input);
  if (!receipt) return null;
  return {
    vin: input.vin,
    vinConfirmed: "true",
    vinConfirmedSource: "user_entered",
    vinConfirmedReviewId: input.reviewId,
    vinCandidate: "",
    vinCandidateSource: "",
    vinCandidateConfidence: "",
    vinConflictValue: "",
    vinConflictSource: "",
    vinConflict: "",
    vinUncertain: "",
    vinReviewId: "",
    vinChallenge: input.challengeId,
    ...(input.draftScope ? { vinDraftScope: input.draftScope } : {}),
    ...receipt,
  };
}
