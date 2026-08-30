/**
 * VAUTO AI Maturity — Phase 2C: shared VIN provenance & explicit human
 * confirmation boundary.
 *
 * SINGLE AUTHORITATIVE IMPLEMENTATION for client AND server. This file lives at
 * repo-root `shared/vin-review.ts`; the client imports it via `@vauto/shared/vin-review`.
 * The server uses the committed mirrored copy at `server/src/shared/vin-review.ts`
 * (see `server/src/vehicle/__tests__/vin-contract-parity.test.ts`, which asserts the
 * mirror is byte-identical and behaviorally identical). React components may render
 * UI and emit structured actions — they must never implement parallel VIN logic.
 *
 * Doctrine: AI extracts and proposes. The human confirms via a structured UI action
 * bound to the exact normalized VIN value AND the exact current `vinReviewId`
 * generation. Ordinary chat text — including an exact 17-char VIN — never confirms.
 * Typing or correcting a VIN field never confirms either: it only ever creates or
 * replaces an unconfirmed candidate that requires its own explicit confirmation.
 */

import { isPlausibleVin, normalizeVin } from "./vin-utils.js";

export type VinProvenance =
  | "user_entered"
  | "photo_ocr"
  | "document_ocr"
  | "existing_confirmed"
  | "unknown";

/** Derived only — never persisted as a separate field. */
export type VinReviewStatus =
  | "absent"
  | "candidate"
  | "conflict"
  | "confirmed"
  | "legacy_unconfirmed";

/**
 * Typed reducer outcome. Callers MUST base user-facing replies on this — never on
 * the incoming action type alone.
 */
export type VinReviewOutcome =
  /** State changed exactly as requested. */
  | "applied"
  /** Action carried an old/mismatched review generation — safe no-op. */
  | "stale_review"
  /** Value failed VIN plausibility — safe no-op. */
  | "invalid_value"
  /** No pending review to act on (no candidate/conflict for this generation). */
  | "not_found"
  /** Value is already the confirmed canonical — nothing to do. */
  | "already_applied"
  /** Rejection applied — pending review markers removed. */
  | "rejected";

export type VinExtraction = {
  value: string;
  source: VinProvenance;
  /** 0..1. Advisory only — never a substitute for human confirmation. */
  confidence?: number;
};

export type VinReviewConfirmAction = {
  type: "confirm";
  value: string;
  reviewId: string;
};

export type VinReviewRejectAction = {
  type: "reject";
  reviewId: string;
};

export type VinReviewCorrectAction = {
  type: "correct";
  value: string;
  /** Bound to the exact displayed review generation — stale corrections are no-ops. */
  reviewId: string;
};

export type VinReviewStructuredAction =
  | VinReviewConfirmAction
  | VinReviewRejectAction
  | VinReviewCorrectAction;

export type VinReviewState = {
  status: VinReviewStatus;
  reviewId?: string;
  canonical?: string;
  canonicalSource?: VinProvenance;
  candidate?: string;
  candidateSource?: VinProvenance;
  candidateConfidence?: number;
  conflictValue?: string;
  conflictSource?: VinProvenance;
};

export type VinReviewActionResult = {
  attrs: Record<string, string>;
  outcome: VinReviewOutcome;
};

/** Trusted client-facing payload — never placed in LLM-visible tool results. */
export type VinReviewSideEffectPayload = {
  type: "vin_review";
  reviewId: string;
  /** Server-registered challenge identity (Round 4) — required for confirmation. */
  challengeId?: string;
  status: "candidate" | "conflict";
  candidate?: string;
  candidateSource?: VinProvenance;
  conflictValue?: string;
  conflictSource?: VinProvenance;
  canonical?: string;
  choices: Array<{
    value: string;
    source?: VinProvenance;
    labelLt: string;
  }>;
};

export type VinAttributes = Partial<
  Record<
    | "vin"
    | "vinCandidate"
    | "vinCandidateSource"
    | "vinCandidateConfidence"
    | "vinConflictValue"
    | "vinConflictSource"
    | "vinConflict"
    | "vinUncertain"
    | "vinReviewId"
    | "vinConfirmed"
    | "vinConfirmedSource"
    | "vinConfirmedReviewId"
    | "vinChallenge"
    | "vinDraftScope",
    string
  >
>;

const VIN_REVIEW_KEYS = [
  "vin",
  "vinCandidate",
  "vinCandidateSource",
  "vinCandidateConfidence",
  "vinConflictValue",
  "vinConflictSource",
  "vinConflict",
  "vinUncertain",
  "vinReviewId",
  "vinConfirmed",
  "vinConfirmedSource",
  "vinConfirmedReviewId",
  "vinChallenge",
  "vinDraftScope",
] as const;

/**
 * Server-minted VIN confirmation receipt attribute keys (Round 3).
 *
 * These carry the ONLY server-owned confirmation authority: an HMAC receipt plus
 * its issuance/expiry metadata, minted exclusively by the authenticated server
 * confirmation boundary and verified at the final persistence boundary. They are
 * NEVER authority themselves — a forged value fails verification and results in
 * VIN omission. They must never be shown to the LLM and must never be persisted
 * on a listing record.
 */
export const VIN_CONFIRMATION_ATTR_KEYS = [
  "vinConfirmationReceipt",
  "vinConfirmationIssuedAt",
  "vinConfirmationExpiresAt",
] as const;

/** Keys that must never be written by an LLM, tool call, vision JSON, OCR or import. */
export const UNTRUSTED_VIN_MARKER_KEYS = [
  ...VIN_REVIEW_KEYS,
  ...VIN_CONFIRMATION_ATTR_KEYS,
] as const;

/** Ephemeral draft-only keys stripped at the publish boundary. */
export const VIN_REVIEW_EPHEMERAL_ATTR_KEYS = [
  "vinCandidate",
  "vinCandidateSource",
  "vinCandidateConfidence",
  "vinConflictValue",
  "vinConflictSource",
  "vinConflict",
  "vinUncertain",
  "vinReviewId",
  "vinConfirmed",
  "vinConfirmedSource",
  "vinConfirmedReviewId",
  "vinChallenge",
  "vinDraftScope",
  "vinReviewState",
] as const;

/** Generic (value-free) model-visible marker: a human must review the VIN. */
export const VIN_REVIEW_MODEL_STATE_KEY = "vinReviewState";

const PROVENANCE_LABEL_LT: Record<VinProvenance, string> = {
  user_entered: "įvesta rankiniu būdu",
  photo_ocr: "nuskaityta iš nuotraukos",
  document_ocr: "nuskaityta iš dokumento",
  existing_confirmed: "ankstesnis patvirtintas VIN",
  unknown: "aptikta pokalbio tekste",
};

let reviewIdCounter = 0;

/** Collision-resistant opaque review generation token. */
export function mintVinReviewId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `vr_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  reviewIdCounter += 1;
  return `vr_${Date.now().toString(36)}${reviewIdCounter.toString(36)}`;
}

/** Test-only: reset the fallback counter for deterministic IDs. */
export function resetVinReviewIdCounterForTests(value = 0): void {
  reviewIdCounter = value;
}

function trimmed(v: string | undefined): string {
  return String(v ?? "").trim();
}

function isHumanConfirmed(attrs: VinAttributes): boolean {
  return trimmed(attrs.vinConfirmed) === "true";
}

function applyPatch(
  attrs: Record<string, string>,
  patch: VinAttributes
): Record<string, string> {
  const next: Record<string, string> = { ...attrs };
  for (const key of VIN_REVIEW_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}

function clearPendingReviewMarkers(): VinAttributes {
  return {
    vinCandidate: "",
    vinCandidateSource: "",
    vinCandidateConfidence: "",
    vinConflictValue: "",
    vinConflictSource: "",
    vinConflict: "",
    vinUncertain: "",
    vinReviewId: "",
    vinChallenge: "",
  };
}

function withFreshReview(
  attrs: Record<string, string>,
  patch: VinAttributes,
  reviewId = mintVinReviewId()
): Record<string, string> {
  return applyPatch(attrs, { ...patch, vinReviewId: reviewId });
}

export function deriveVinReviewState(attrs: VinAttributes): VinReviewState {
  const canonical = trimmed(attrs.vin);
  const candidate = trimmed(attrs.vinCandidate);
  const conflictValue = trimmed(attrs.vinConflictValue);
  const hasConflict = trimmed(attrs.vinConflict) === "true" && Boolean(conflictValue);
  const reviewId = trimmed(attrs.vinReviewId) || undefined;
  const canonicalSource = (attrs.vinConfirmedSource as VinProvenance | undefined) ?? undefined;

  if (canonical && isHumanConfirmed(attrs) && !hasConflict) {
    return {
      status: "confirmed",
      reviewId,
      canonical,
      canonicalSource,
    };
  }

  if (canonical && !isHumanConfirmed(attrs) && !candidate && !hasConflict) {
    return {
      status: "legacy_unconfirmed",
      canonical,
    };
  }

  if (hasConflict) {
    return {
      status: "conflict",
      reviewId,
      canonical: canonical || undefined,
      canonicalSource,
      candidate: candidate || canonical || undefined,
      candidateSource: (attrs.vinCandidateSource as VinProvenance | undefined) ?? undefined,
      candidateConfidence:
        attrs.vinCandidateConfidence != null ? Number(attrs.vinCandidateConfidence) : undefined,
      conflictValue,
      conflictSource: (attrs.vinConflictSource as VinProvenance | undefined) ?? undefined,
    };
  }

  if (candidate) {
    return {
      status: "candidate",
      reviewId,
      canonical: canonical || undefined,
      candidate,
      candidateSource: (attrs.vinCandidateSource as VinProvenance | undefined) ?? undefined,
      candidateConfidence:
        attrs.vinCandidateConfidence != null ? Number(attrs.vinCandidateConfidence) : undefined,
    };
  }

  return { status: "absent" };
}

/**
 * NOTE (Round 3): persisted-listing VIN adoption and publish-time VIN authority
 * are SERVER-OWNED. They live in `server/src/vehicle/vin-confirmation.ts`
 * (`finalizeCreateVinAuthority` / `finalizePatchVinAuthority` + the HMAC
 * confirmation receipt), not in this shared client/server state module. The
 * shared module only defines draft-state transitions and shape helpers — the
 * browser is never an authority source.
 */

/**
 * Apply a freshly extracted VIN as an unconfirmed candidate ONLY.
 *
 * - Never writes canonical `vin` (except leaving an already-confirmed canonical
 *   untouched when the extraction agrees with it).
 * - Never sets `vinConfirmed` — confidence is advisory only.
 * - Disagreeing sources escalate to a two-way conflict; a third value is discarded
 *   so a pending conflict is never silently resolved (A→B→A safe).
 * - Re-applying the same value is idempotent (keeps the current generation).
 */
export function applyVinExtractionCandidate(
  attrs: Record<string, string>,
  extraction: VinExtraction
): Record<string, string> {
  const value = normalizeVin(extraction.value ?? "");
  if (!isPlausibleVin(value)) return attrs;

  const canonical = trimmed(attrs.vin);
  const candidate = trimmed(attrs.vinCandidate);
  const conflictValue = trimmed(attrs.vinConflictValue);
  const confirmed = isHumanConfirmed(attrs);

  if (canonical && confirmed) {
    if (value === canonical) return attrs;
    return withFreshReview(attrs, {
      vinConflictValue: value,
      vinConflictSource: extraction.source,
      vinConflict: "true",
    });
  }

  if (conflictValue) {
    // A conflict is already pending — never silently pick a winner.
    return attrs;
  }

  if (candidate) {
    if (value === candidate) {
      return applyPatch(attrs, {
        vinCandidateSource: extraction.source,
        vinCandidateConfidence:
          extraction.confidence != null ? String(extraction.confidence) : attrs.vinCandidateConfidence,
      });
    }
    return withFreshReview(attrs, {
      vinConflictValue: value,
      vinConflictSource: extraction.source,
      vinConflict: "true",
    });
  }

  // Legacy unconfirmed canonical: it carries no human authority, so a fresh
  // extraction REPLACES it with a candidate (publish omits either way).
  if (canonical) {
    if (value === canonical) return attrs;
  }

  return withFreshReview(attrs, {
    vinCandidate: value,
    vinCandidateSource: extraction.source,
    vinCandidateConfidence: extraction.confidence != null ? String(extraction.confidence) : undefined,
    vinUncertain: "true",
    vinConfirmed: "",
    vinConfirmedSource: "",
    vinConfirmedReviewId: "",
    vin: "",
  });
}

/**
 * Manual VIN field entry (PrePublish typing): creates/replaces an unconfirmed
 * candidate with a FRESH review generation and clears all prior confirmation
 * authority. Typing is never confirmation — a separate explicit confirm action
 * is still required.
 */
export function applyVinManualEntryCandidate(
  attrs: Record<string, string>,
  value: string,
  source: VinProvenance = "user_entered"
): Record<string, string> {
  const v = normalizeVin(value ?? "");

  if (!v) {
    // Cleared input: drop pending markers + stale authority, keep canonical
    // untouched (removal of an already-persisted VIN is a publish-level concern).
    return applyPatch(attrs, {
      ...clearPendingReviewMarkers(),
      vinConfirmed: "",
      vinConfirmedSource: "",
      vinConfirmedReviewId: "",
    });
  }

  if (!isPlausibleVin(v)) {
    // Implausible input: no candidate, but stale authority must not linger.
    return applyPatch(attrs, {
      ...clearPendingReviewMarkers(),
      vinConfirmed: "",
      vinConfirmedSource: "",
      vinConfirmedReviewId: "",
    });
  }

  return withFreshReview(attrs, {
    vinCandidate: v,
    vinCandidateSource: source,
    vinCandidateConfidence: "1",
    vinUncertain: "true",
    vinConflictValue: "",
    vinConflictSource: "",
    vinConflict: "",
    vinConfirmed: "",
    vinConfirmedSource: "",
    vinConfirmedReviewId: "",
    vin: "",
  });
}

export function confirmVin(
  attrs: Record<string, string>,
  action: VinReviewConfirmAction
): VinReviewActionResult {
  const value = normalizeVin(action.value ?? "");
  const reviewId = trimmed(action.reviewId);
  const currentReviewId = trimmed(attrs.vinReviewId);

  if (!value) return { attrs, outcome: "invalid_value" };

  const state = deriveVinReviewState(attrs);
  if (state.status !== "candidate" && state.status !== "conflict") {
    return { attrs, outcome: "not_found" };
  }
  if (!reviewId || reviewId !== currentReviewId) return { attrs, outcome: "stale_review" };

  const candidate = state.candidate ? normalizeVin(state.candidate) : "";
  const conflictValue = state.conflictValue ? normalizeVin(state.conflictValue) : "";
  const canonical = state.canonical ? normalizeVin(state.canonical) : "";

  if (value !== candidate && value !== conflictValue && value !== canonical) {
    return { attrs, outcome: "invalid_value" };
  }

  const confirmSource: VinProvenance =
    value === conflictValue
      ? (state.conflictSource ?? "unknown")
      : value === candidate
        ? (state.candidateSource ?? "user_entered")
        : (state.canonicalSource ?? "existing_confirmed");

  const next = applyPatch(attrs, {
    vin: value,
    vinConfirmed: "true",
    vinConfirmedSource: confirmSource,
    vinConfirmedReviewId: reviewId,
    ...clearPendingReviewMarkers(),
  });
  return { attrs: next, outcome: "applied" };
}

export function rejectVin(
  attrs: Record<string, string>,
  action: VinReviewRejectAction
): VinReviewActionResult {
  const reviewId = trimmed(action.reviewId);
  const currentReviewId = trimmed(attrs.vinReviewId);

  const state = deriveVinReviewState(attrs);
  if (state.status !== "candidate" && state.status !== "conflict") {
    return { attrs, outcome: "not_found" };
  }
  if (!reviewId || reviewId !== currentReviewId) return { attrs, outcome: "stale_review" };

  const canonical = trimmed(attrs.vin);
  const confirmed = isHumanConfirmed(attrs);

  const cleared = applyPatch(attrs, clearPendingReviewMarkers());

  if (canonical && confirmed) {
    // Rejecting a challenger keeps the prior confirmed canonical.
    return { attrs: cleared, outcome: "rejected" };
  }

  return {
    attrs: applyPatch(cleared, {
      vin: "",
      vinConfirmed: "",
      vinConfirmedSource: "",
      vinConfirmedReviewId: "",
    }),
    outcome: "rejected",
  };
}

export function correctVin(
  attrs: Record<string, string>,
  action: VinReviewCorrectAction
): VinReviewActionResult {
  const reviewId = trimmed(action.reviewId);
  const currentReviewId = trimmed(attrs.vinReviewId);

  const state = deriveVinReviewState(attrs);
  if (state.status !== "candidate" && state.status !== "conflict") {
    return { attrs, outcome: "not_found" };
  }
  if (!reviewId || reviewId !== currentReviewId) return { attrs, outcome: "stale_review" };

  const value = normalizeVin(action.value ?? "");
  if (!value) return { attrs, outcome: "invalid_value" };
  if (!isPlausibleVin(value)) return { attrs, outcome: "invalid_value" };

  const next = withFreshReview(attrs, {
    vinCandidate: value,
    vinCandidateSource: "user_entered",
    vinCandidateConfidence: "1",
    vinUncertain: "true",
    vinConflictValue: "",
    vinConflictSource: "",
    vinConflict: "",
    vinConfirmed: "",
    vinConfirmedSource: "",
    vinConfirmedReviewId: "",
    vin: "",
  });
  return { attrs: next, outcome: "applied" };
}

export function applyVinStructuredReviewAction(
  attrs: Record<string, string>,
  action: VinReviewStructuredAction
): VinReviewActionResult {
  switch (action.type) {
    case "confirm":
      return confirmVin(attrs, action);
    case "reject":
      return rejectVin(attrs, action);
    case "correct":
      return correctVin(attrs, action);
    default:
      return { attrs, outcome: "not_found" };
  }
}

/**
 * Strip every VIN value + authority marker from an UNTRUSTED attribute map
 * (LLM tool arguments, vision JSON, OCR, imports). Only the caller's explicit
 * routing of a fresh value through `applyVinExtractionCandidate` may add VIN
 * state back.
 */
export function stripUntrustedVinMarkers(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if ((UNTRUSTED_VIN_MARKER_KEYS as readonly string[]).includes(key)) continue;
    if (key === VIN_REVIEW_MODEL_STATE_KEY) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Model-visible projection of a draft attribute map: no VIN value, no reviewId,
 * no confirmation provenance — only a generic flag that human VIN review is
 * required. The trusted client side-effect remains the only channel that carries
 * the exact candidate and reviewId.
 */
export function redactVinReviewForModel(
  raw: Record<string, unknown> | undefined | null
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if ((UNTRUSTED_VIN_MARKER_KEYS as readonly string[]).includes(key)) continue;
    if (key === VIN_REVIEW_MODEL_STATE_KEY) continue;
    if (value == null || value === "") continue;
    out[key] = Array.isArray(value) ? value.map(String).join(", ") : String(value);
  }
  if (vinReviewRequiresHumanAttention(raw as VinAttributes)) {
    out[VIN_REVIEW_MODEL_STATE_KEY] = "pending_human_review";
  }
  return out;
}

export function pickVinStateAttributes(attrs: VinAttributes | undefined): VinAttributes {
  const out: VinAttributes = {};
  if (!attrs) return out;
  for (const key of VIN_REVIEW_KEYS) {
    const v = attrs[key];
    if (v != null && v !== "") out[key] = v;
  }
  return out;
}

export function buildVinReviewSideEffect(
  attrs: VinAttributes
): VinReviewSideEffectPayload | null {
  const state = deriveVinReviewState(attrs);
  const reviewId = trimmed(attrs.vinReviewId);
  if (!reviewId) return null;
  if (state.status !== "candidate" && state.status !== "conflict") return null;

  const choices: VinReviewSideEffectPayload["choices"] = [];

  if (state.status === "candidate" && state.candidate) {
    const src = state.candidateSource;
    choices.push({
      value: state.candidate,
      source: src,
      labelLt: src ? PROVENANCE_LABEL_LT[src] : "siūlomas VIN",
    });
  }

  if (state.status === "conflict") {
    const primary = state.candidate ?? state.canonical;
    if (primary) {
      choices.push({
        value: primary,
        source: state.candidateSource,
        labelLt: state.candidateSource
          ? PROVENANCE_LABEL_LT[state.candidateSource]
          : "pirmasis šaltinis",
      });
    }
    if (state.conflictValue) {
      choices.push({
        value: state.conflictValue,
        source: state.conflictSource,
        labelLt: state.conflictSource
          ? PROVENANCE_LABEL_LT[state.conflictSource]
          : "antras šaltinis",
      });
    }
  }

  if (!choices.length) return null;

  return {
    type: "vin_review",
    reviewId,
    challengeId: trimmed(attrs.vinChallenge) || undefined,
    status: state.status,
    candidate: state.candidate,
    candidateSource: state.candidateSource,
    conflictValue: state.conflictValue,
    conflictSource: state.conflictSource,
    canonical: state.canonical,
    choices,
  };
}

/** Display-only chip labels — authority lives in the vinReview side-effect, not chip text. */
export function buildVinReviewDisplayChips(_attrs: VinAttributes): string[] | null {
  const state = deriveVinReviewState(_attrs);
  if (state.status === "candidate") {
    return ["Patvirtinti VIN", "Įvesti kitą VIN", "Nežinau VIN"];
  }
  if (state.status === "conflict") {
    return ["Pasirinkti VIN", "Įvesti kitą VIN", "Nežinau VIN"];
  }
  return null;
}

export function vinReviewRequiresHumanAttention(attrs: VinAttributes): boolean {
  const state = deriveVinReviewState(attrs);
  return state.status === "candidate" || state.status === "conflict";
}
