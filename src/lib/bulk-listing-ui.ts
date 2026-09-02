import type {
  BulkConfirmResponse,
  BulkOutcome,
  BulkPreviewResponse,
} from "@/lib/api/bulk-listings";

/**
 * F6 Final — pure UI logic for the seller cockpit bulk manager.
 * No React, no fetch: fully deterministic for node:test coverage.
 */

export const BULK_MAX_TARGETS = 100;

export type BulkRole = string | null | undefined;

export const BULK_ROLES = ["pro", "admin", "super_admin"] as const;

export function canUseBulkUi(role: BulkRole): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return (BULK_ROLES as readonly string[]).includes(r);
}

export type BulkEligibleListing = {
  id: string;
  title?: string;
  status?: string;
  category?: string;
  sellerId?: string;
};

/** hide → currently visible listings; republish → soft-deleted listings. */
export function listingSupportsOperation(
  listing: { status?: string },
  operation: "hide" | "republish"
): boolean {
  const s = String(listing.status ?? "").toLowerCase();
  if (operation === "hide") return s === "active" || s === "paused";
  return s === "deleted";
}

export function selectableListings(
  listings: BulkEligibleListing[],
  operation: "hide" | "republish"
): BulkEligibleListing[] {
  return listings.filter((l) => listingSupportsOperation(l, operation));
}

/**
 * Select-all is scoped to the CLEARLY VISIBLE set passed in (never a hidden
 * page beyond the current view). When every visible id is already selected
 * the toggle deselects them, mirroring common list semantics.
 */
export function toggleSelectAllVisible(
  visibleIds: string[],
  currentlySelected: string[],
  operation: "hide" | "republish",
  listings: BulkEligibleListing[]
): string[] {
  const eligible = new Set(
    selectableListings(listings, operation).map((l) => l.id)
  );
  const visible = visibleIds.filter((id) => eligible.has(id));
  const selected = new Set(currentlySelected);
  const allVisibleSelected =
    visible.length > 0 && visible.every((id) => selected.has(id));
  if (allVisibleSelected) {
    for (const id of visible) selected.delete(id);
  } else {
    for (const id of visible) selected.add(id);
  }
  return [...selected].sort();
}

export function toggleSelection(
  id: string,
  currentlySelected: string[]
): string[] {
  const set = new Set(currentlySelected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set].sort();
}

export type SelectionValidation =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_many"; message: string };

export function validateSelectionCount(
  ids: string[],
  max = BULK_MAX_TARGETS
): SelectionValidation {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return { ok: false, reason: "empty", message: "Pasirinkite bent vieną skelbimą." };
  }
  if (unique.length > max) {
    return {
      ok: false,
      reason: "too_many",
      message: `Vienu metu galima valdyti daugiausia ${max} skelbimų.`,
    };
  }
  return { ok: true };
}

export type ProposalClockState =
  | { kind: "fresh"; expiresAt: number; secondsLeft: number }
  | { kind: "expired" };

export function proposalClock(
  preview: BulkPreviewResponse | null,
  nowMs: number
): ProposalClockState {
  if (!preview) return { kind: "expired" };
  const left = preview.proposal.expiresAt - nowMs;
  if (left <= 0) return { kind: "expired" };
  return {
    kind: "fresh",
    expiresAt: preview.proposal.expiresAt,
    secondsLeft: Math.floor(left / 1000),
  };
}

export function formatProposalExpiry(expiresAt: number, nowMs: number): string {
  const left = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type OutcomeSummary = {
  success: number;
  failed: number;
  skipped: number;
  total: number;
  isPartialFailure: boolean;
};

export function summarizeOutcomes(outcomes: BulkOutcome[]): OutcomeSummary {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const o of outcomes) {
    if (o.status === "success") success += 1;
    else if (o.status === "failed") failed += 1;
    else skipped += 1;
  }
  return {
    success,
    failed,
    skipped,
    total: outcomes.length,
    isPartialFailure: failed > 0 && (success > 0 || skipped > 0),
  };
}

/**
 * Confirm/recover result state machine for the UI. The client mirrors the
 * SERVER state — it never invents execution states.
 */
export type BulkResultUiState =
  | { kind: "idle" }
  | { kind: "preview" }
  | { kind: "confirming" }
  | {
      kind: "done";
      outcomes: BulkOutcome[];
      summary: OutcomeSummary;
      replayed: boolean;
      state: string;
    }
  | { kind: "conflict"; code: string; state?: string; message: string };

export function resultStateFromConfirm(
  response: BulkConfirmResponse | null,
  error: string | null
): BulkResultUiState {
  if (error) {
    return { kind: "conflict", code: "error", message: error };
  }
  if (!response) return { kind: "idle" };
  if (!response.ok) {
    return {
      kind: "conflict",
      code: response.code ?? "error",
      state: response.state,
      message: response.error ?? "Nepavyko įvykdyti operacijos.",
    };
  }
  const outcomes = response.outcomes ?? [];
  return {
    kind: "done",
    outcomes,
    summary: summarizeOutcomes(outcomes),
    replayed: response.replayed === true,
    state: response.state ?? "COMPLETED",
  };
}

/** Conflict codes that the durable F6.2 core surfaces to the UI. */
export const BULK_CONFLICT_CODES = {
  in_progress: "in_progress",
  recovery_required: "recovery_required",
  fenced: "fenced",
  expired: "expired",
  tampered: "tampered",
  disabled: "disabled",
  unauthorized: "unauthorized",
} as const;

export function conflictNeedsRecovery(code: string | undefined): boolean {
  return (
    code === "recovery_required" ||
    code === "fenced" ||
    code === "in_progress"
  );
}

export function conflictNeedsNewPreview(code: string | undefined): boolean {
  return code === "expired" || code === "tampered";
}

export function conflictIsDisabled(code: string | undefined): boolean {
  return code === "disabled" || code === "unauthorized";
}
