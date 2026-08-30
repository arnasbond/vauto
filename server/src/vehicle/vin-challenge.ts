/**
 * VAUTO AI Maturity — Phase 2C Round 5: SERVER-OWNED draft scope + challenge.
 *
 * Two server-owned identities:
 *  - draft scope (`vs_…`): opaque token minted by the server and bound to the
 *    authenticated user; identifies the client-held draft for create flows.
 *    The browser can never invent a trusted scope — every use is verified
 *    against the scope store (user + lifetime).
 *  - challenge (`vc_…`): pending review challenge bound to
 *    (userId + draftScope) or (userId + listingId).
 *
 * AUTOMATIC supersession: registering a new challenge for the same
 * (userId + draftScope) / (userId + listingId) supersedes EVERY prior pending
 * or confirmed challenge in that scope — regardless of any client hints.
 * Client-provided supersedesChallengeId / supersedesReviewId are additional
 * hints only and are IGNORED unless they target the same user AND scope (a
 * guessed/leaked id can never invalidate another user's challenge).
 *
 * SAFE REPLAY: `consumeVinChallenge` performs ALL binding checks (existence,
 * user, expiry, scope/listing, VIN/choice set, generation) BEFORE returning an
 * `already_confirmed` replay — a failed replay never returns authority data.
 *
 * BOUNDED STORE: the in-memory stores are capped (per-user and globally) with
 * deterministic expiry cleanup and terminal-record eviction; registration spam
 * cannot grow the maps indefinitely.
 */

import crypto from "node:crypto";
import { isPlausibleVin, normalizeVin } from "../shared/vin-utils.js";
import {
  deriveVinReviewState,
  mintVinReviewId,
  type VinProvenance,
  type VinReviewStatus,
} from "../shared/vin-review.js";

const DEFAULT_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_SCOPE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bounded-store limits (see §6 of the Round 5 report). */
export const VIN_STORE_LIMITS = {
  maxChallengesPerUser: 50,
  maxChallengesTotal: 2000,
  maxScopesPerUser: 20,
  maxScopesTotal: 500,
} as const;

export type VinChallengeOutcome =
  | "confirmed"
  | "already_confirmed"
  | "challenge_not_found"
  | "challenge_expired"
  | "wrong_user"
  | "wrong_listing"
  | "wrong_scope"
  | "wrong_vin"
  | "choice_not_allowed"
  | "stale_generation"
  | "rejected"
  | "store_full";

export interface VinChallengeRecord {
  challengeId: string;
  userId: string;
  listingId?: string;
  draftScope?: string;
  /** Single-candidate challenges carry `vin`; conflicts carry `choices` (2 values). */
  vin?: string;
  choices?: string[];
  /** Server-minted review generation token. */
  reviewId: string;
  provenance: VinProvenance;
  issuedAt: number;
  expiresAt: number;
  status: "pending" | "confirmed" | "rejected" | "superseded" | "expired";
  /** Stored on confirm for idempotent replay. */
  receipt?: Record<string, string>;
}

export interface VinChallengeStore {
  get(challengeId: string): VinChallengeRecord | undefined;
  set(challengeId: string, record: VinChallengeRecord): void;
  delete(challengeId: string): void;
  list(): VinChallengeRecord[];
}

export function createInMemoryVinChallengeStore(): VinChallengeStore {
  const map = new Map<string, VinChallengeRecord>();
  return {
    get: (id) => map.get(id),
    set: (id, r) => {
      map.set(id, r);
    },
    delete: (id) => {
      map.delete(id);
    },
    list: () => [...map.values()],
  };
}

let defaultStore: VinChallengeStore = createInMemoryVinChallengeStore();

export function setDefaultVinChallengeStoreForTests(store: VinChallengeStore): void {
  defaultStore = store;
}

export function getDefaultVinChallengeStore(): VinChallengeStore {
  return defaultStore;
}

export function resetVinChallengeBoundaryForTests(): void {
  defaultStore = createInMemoryVinChallengeStore();
  defaultScopeStore = createInMemoryVinScopeStore();
}

// ---------------------------------------------------------------------------
// Draft scope store
// ---------------------------------------------------------------------------

export interface VinDraftScopeRecord {
  draftScope: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface VinScopeStore {
  get(draftScope: string): VinDraftScopeRecord | undefined;
  set(draftScope: string, record: VinDraftScopeRecord): void;
  delete(draftScope: string): void;
  list(): VinDraftScopeRecord[];
}

export function createInMemoryVinScopeStore(): VinScopeStore {
  const map = new Map<string, VinDraftScopeRecord>();
  return {
    get: (id) => map.get(id),
    set: (id, r) => {
      map.set(id, r);
    },
    delete: (id) => {
      map.delete(id);
    },
    list: () => [...map.values()],
  };
}

let defaultScopeStore: VinScopeStore = createInMemoryVinScopeStore();

export function getDefaultVinScopeStore(): VinScopeStore {
  return defaultScopeStore;
}

export function setDefaultVinScopeStoreForTests(store: VinScopeStore): void {
  defaultScopeStore = store;
}

function scopeTtlMs(): number {
  const raw = Number(process.env.VIN_SCOPE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SCOPE_TTL_MS;
}

function ttlMs(): number {
  const raw = Number(process.env.VIN_CHALLENGE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHALLENGE_TTL_MS;
}

function mintChallengeId(): string {
  return `vc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function mintScopeId(): string {
  return `vs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function sweepScopeStore(store: VinScopeStore, nowMs: number): void {
  for (const record of store.list()) {
    if (record.expiresAt <= nowMs) store.delete(record.draftScope);
  }
}

/**
 * Mint a server-owned draft scope bound to the authenticated user.
 * Bounded, cross-user safe: expired scopes are swept first; beyond the PER-USER
 * cap the requesting user's OLDEST own scope is evicted (never another user's);
 * when the GLOBAL cap is still full the mint FAILS CLOSED and returns null
 * (the register endpoint maps that to a typed 429 `store_full`).
 */
export function mintVinDraftScope(
  userId: string,
  opts?: { nowMs?: number; ttlOverrideMs?: number }
): VinDraftScopeRecord | null {
  const user = String(userId ?? "").trim();
  if (!user) return null;
  const nowMs = opts?.nowMs ?? Date.now();
  const store = getDefaultVinScopeStore();
  // 1. Sweep expired scopes first.
  sweepScopeStore(store, nowMs);

  // 2. Per-user policy applies ONLY to the requesting user (oldest OWN scope
  //    evicted beyond the per-user cap — never another user's).
  const userRecords = store
    .list()
    .filter((r) => r.userId === user)
    .sort((a, b) => a.issuedAt - b.issuedAt);
  while (userRecords.length >= VIN_STORE_LIMITS.maxScopesPerUser) {
    const oldest = userRecords.shift();
    if (!oldest) break;
    store.delete(oldest.draftScope);
  }

  // 3. Global cap: NEVER evict another user's still-active scope to make room.
  //    Fail closed when the global cap remains full.
  if (store.list().length >= VIN_STORE_LIMITS.maxScopesTotal) {
    return null;
  }

  const draftScope = mintScopeId();
  const record: VinDraftScopeRecord = {
    draftScope,
    userId: user,
    issuedAt: nowMs,
    expiresAt: nowMs + (opts?.ttlOverrideMs ?? scopeTtlMs()),
  };
  store.set(draftScope, record);
  return record;
}

export type VinScopeVerifyResult =
  | { ok: true; draftScope: string }
  | { ok: false; reason: "scope_not_found" | "scope_expired" | "wrong_user" };

/** The browser cannot invent a trusted scope — every use is verified here. */
export function verifyVinDraftScope(
  userId: string,
  draftScope: string,
  nowMs?: number
): VinScopeVerifyResult {
  const user = String(userId ?? "").trim();
  const scope = String(draftScope ?? "").trim();
  if (!user || !scope) return { ok: false, reason: "scope_not_found" };
  const store = getDefaultVinScopeStore();
  sweepScopeStore(store, nowMs ?? Date.now());
  const record = store.get(scope);
  if (!record) return { ok: false, reason: "scope_not_found" };
  if (record.userId !== user) return { ok: false, reason: "wrong_user" };
  if (record.expiresAt <= (nowMs ?? Date.now())) {
    return { ok: false, reason: "scope_expired" };
  }
  return { ok: true, draftScope: scope };
}

// ---------------------------------------------------------------------------
// Challenge store
// ---------------------------------------------------------------------------

function sweepChallengeStore(store: VinChallengeStore, nowMs: number): void {
  for (const record of store.list()) {
    if (record.expiresAt > nowMs) continue;
    if (record.status === "pending") {
      // Keep pending-expired records so consumption can report the typed
      // `challenge_expired` outcome (rather than a generic not-found).
      store.set(record.challengeId, { ...record, status: "expired" });
      continue;
    }
    store.delete(record.challengeId);
  }
}

/**
 * Deterministic terminal-record cleanup (superseded/rejected), oldest first.
 * When the store is AT OR ABOVE the cap, terminal records are evicted until
 * the store is back under the cap (or no terminal records remain). Active
 * pending/confirmed records are NEVER evicted — the registration then fails
 * closed with `store_full` when the cap remains full.
 */
function evictTerminalRecords(store: VinChallengeStore, maxTotal: number): void {
  const records = store.list();
  if (records.length < maxTotal) return;
  const terminal = records
    .filter((r) => r.status === "superseded" || r.status === "rejected")
    .sort((a, b) => a.issuedAt - b.issuedAt);
  for (const record of terminal) {
    if (store.list().length < maxTotal) return;
    store.delete(record.challengeId);
  }
}

export interface RegisterVinChallengeInput {
  userId: string;
  listingId?: string;
  /** Server-owned draft scope for create flows (verified by the caller). */
  draftScope?: string;
  /** Candidate value (single-candidate review) or conflict choice set (2 values). */
  values: string[];
  provenance?: VinProvenance;
  /** Hints only — never the security mechanism (see file header). */
  supersedesChallengeId?: string;
  supersedesReviewId?: string;
  nowMs?: number;
  ttlOverrideMs?: number;
}

export type RegisterVinChallengeResult =
  | {
      outcome: "registered";
      challenge: VinChallengeRecord;
      /** Draft attributes to attach: server generation + challenge identity. */
      attrs: Record<string, string>;
    }
  | { outcome: "store_full" };

function sameScope(
  a: Pick<VinChallengeRecord, "listingId" | "draftScope">,
  b: Pick<VinChallengeRecord, "listingId" | "draftScope">
): boolean {
  if (a.listingId && b.listingId) return a.listingId === b.listingId;
  if (a.draftScope && b.draftScope) return a.draftScope === b.draftScope;
  return false;
}

/**
 * Register a NEW pending challenge. AUTOMATIC same-scope supersession:
 * every prior pending or confirmed challenge with the same
 * (userId + listingId) or (userId + draftScope) is superseded — no client
 * hints required. Client hints are applied only when they target the same
 * user AND the same scope (cross-user invalidation is impossible).
 */
export function registerVinChallenge(
  input: RegisterVinChallengeInput
): RegisterVinChallengeResult | null {
  const userId = String(input.userId ?? "").trim();
  if (!userId) return null;
  const normalized = (input.values ?? [])
    .map((v) => normalizeVin(String(v ?? "")))
    .filter((v) => isPlausibleVin(v));
  if (!normalized.length) return null;
  if (normalized.length > 2) return null;

  const nowMs = input.nowMs ?? Date.now();
  const store = getDefaultVinChallengeStore();
  // 1. Sweep expired records.
  sweepChallengeStore(store, nowMs);
  // 2. Remove eligible terminal records deterministically.
  evictTerminalRecords(store, VIN_STORE_LIMITS.maxChallengesTotal);
  // 3. Recalculate the total. If the retained record count is still at the
  //    GLOBAL cap, reject — never call store.set beyond the cap and never
  //    evict another user's ACTIVE record merely to make room.
  if (store.list().length >= VIN_STORE_LIMITS.maxChallengesTotal) {
    return { outcome: "store_full" };
  }

  // Per-user bound — bounded store (registration spam cannot grow the map).
  const userCount = store
    .list()
    .filter((r) => r.userId === userId && r.status !== "superseded" && r.status !== "rejected")
    .length;
  if (userCount >= VIN_STORE_LIMITS.maxChallengesPerUser) {
    return { outcome: "store_full" };
  }

  const challengeId = mintChallengeId();
  const reviewId = mintVinReviewId();
  const record: VinChallengeRecord = {
    challengeId,
    userId,
    listingId: input.listingId?.trim() || undefined,
    draftScope: input.draftScope?.trim() || undefined,
    ...(normalized.length === 1 ? { vin: normalized[0] } : { choices: normalized }),
    reviewId,
    provenance: input.provenance ?? "unknown",
    issuedAt: nowMs,
    expiresAt: nowMs + (input.ttlOverrideMs ?? ttlMs()),
    status: "pending",
  };

  for (const existing of store.list()) {
    if (existing.userId !== userId) continue;
    // Automatic same-scope supersession (pending AND confirmed):
    if (
      (record.listingId && existing.listingId === record.listingId) ||
      (record.draftScope && existing.draftScope === record.draftScope)
    ) {
      store.set(existing.challengeId, { ...existing, status: "superseded", receipt: undefined });
      continue;
    }
    // Client hints — same user AND same scope required (never cross-user):
    if (
      input.supersedesChallengeId &&
      existing.challengeId === input.supersedesChallengeId &&
      sameScope(existing, record)
    ) {
      store.set(existing.challengeId, { ...existing, status: "superseded", receipt: undefined });
      continue;
    }
    if (
      input.supersedesReviewId &&
      existing.reviewId === input.supersedesReviewId &&
      sameScope(existing, record)
    ) {
      store.set(existing.challengeId, { ...existing, status: "superseded", receipt: undefined });
    }
  }

  // The size check above guarantees this single insert keeps the invariant
  // `store.size <= VIN_STORE_LIMITS.maxChallengesTotal` (supersession only
  // mutates existing records, it never adds).
  store.set(challengeId, record);

  return {
    outcome: "registered",
    challenge: record,
    attrs: {
      vinReviewId: reviewId,
      vinChallenge: challengeId,
      vinDraftScope: record.draftScope ?? "",
    },
  };
}

export interface ConsumeVinChallengeInput {
  challengeId: string;
  userId: string;
  /** The exact normalized VIN the human confirmed. */
  vin: string;
  listingId?: string;
  draftScope?: string;
  nowMs?: number;
}

export interface ConsumeVinChallengeResult {
  ok: boolean;
  outcome: VinChallengeOutcome;
  /** Draft attribute patch produced by the server (only on confirmed/replay). */
  attrs?: Record<string, string>;
}

/**
 * Verify and consume a pending challenge. SAFE REPLAY ORDERING: every binding
 * check (existence, user, expiry, scope/listing, VIN/choice set, generation)
 * runs BEFORE the `already_confirmed` replay branch — a failed replay returns
 * NO authority data.
 */
export function consumeVinChallenge(
  input: ConsumeVinChallengeInput,
  mintReceipt: (opts: {
    userId: string;
    vin: string;
    reviewId: string;
    listingId?: string;
    draftScope?: string;
    challengeId: string;
  }) => Record<string, string> | null
): ConsumeVinChallengeResult {
  const nowMs = input.nowMs ?? Date.now();
  const store = getDefaultVinChallengeStore();
  sweepChallengeStore(store, nowMs);

  const challengeId = String(input.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, outcome: "challenge_not_found" };

  const record = store.get(challengeId);
  if (!record) return { ok: false, outcome: "challenge_not_found" };
  if (record.status === "expired") return { ok: false, outcome: "challenge_expired" };
  if (record.userId !== String(input.userId ?? "").trim()) {
    return { ok: false, outcome: "wrong_user" };
  }
  if (record.expiresAt <= nowMs) return { ok: false, outcome: "challenge_expired" };
  if (record.status === "rejected") return { ok: false, outcome: "challenge_not_found" };
  if (record.status === "superseded") return { ok: false, outcome: "stale_generation" };
  if (input.listingId !== undefined && record.listingId !== input.listingId) {
    return { ok: false, outcome: "wrong_listing" };
  }
  if (input.draftScope !== undefined && record.draftScope !== input.draftScope) {
    return { ok: false, outcome: "wrong_scope" };
  }

  const vin = normalizeVin(input.vin ?? "");
  if (record.choices) {
    if (!record.choices.includes(vin)) {
      return { ok: false, outcome: "choice_not_allowed" };
    }
  } else if (record.vin !== vin) {
    return { ok: false, outcome: "wrong_vin" };
  }

  if (record.status === "confirmed") {
    // SAFE replay: all bindings validated above; return the SAME stored
    // server-computed authority patch.
    return {
      ok: true,
      outcome: "already_confirmed",
      attrs: record.receipt ?? undefined,
    };
  }

  const receipt = mintReceipt({
    userId: record.userId,
    vin,
    reviewId: record.reviewId,
    listingId: record.listingId,
    draftScope: record.draftScope,
    challengeId: record.challengeId,
  });
  if (!receipt) return { ok: false, outcome: "wrong_vin" };

  store.set(challengeId, { ...record, status: "confirmed", receipt });
  return { ok: true, outcome: "confirmed", attrs: receipt };
}

/**
 * Publish-boundary verification of a CONSUMED challenge: the receipt alone is
 * not sufficient — the challenge must still exist, be confirmed for the same
 * user/VIN/generation/scope and must not have been superseded by a newer
 * generation.
 */
export function verifyConfirmedVinChallenge(input: {
  challengeId: string;
  userId: string;
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  nowMs?: number;
}): { ok: boolean; outcome: VinChallengeOutcome } {
  const store = getDefaultVinChallengeStore();
  sweepChallengeStore(store, input.nowMs ?? Date.now());
  const challengeId = String(input.challengeId ?? "").trim();
  if (!challengeId) return { ok: false, outcome: "challenge_not_found" };
  const record = store.get(challengeId);
  if (!record) return { ok: false, outcome: "challenge_not_found" };
  if (record.status === "superseded") return { ok: false, outcome: "stale_generation" };
  if (record.status === "rejected") return { ok: false, outcome: "challenge_not_found" };
  if (record.status === "expired") return { ok: false, outcome: "challenge_expired" };
  if (record.status !== "confirmed") return { ok: false, outcome: "challenge_not_found" };
  if (record.userId !== String(input.userId ?? "").trim()) {
    return { ok: false, outcome: "wrong_user" };
  }
  if (record.expiresAt <= (input.nowMs ?? Date.now())) {
    return { ok: false, outcome: "challenge_expired" };
  }
  if (input.listingId !== undefined && record.listingId !== input.listingId) {
    return { ok: false, outcome: "wrong_listing" };
  }
  if (input.draftScope !== undefined && record.draftScope !== input.draftScope) {
    return { ok: false, outcome: "wrong_scope" };
  }
  if (record.reviewId !== String(input.reviewId ?? "").trim()) {
    return { ok: false, outcome: "stale_generation" };
  }
  const vin = normalizeVin(input.vin ?? "");
  if (record.choices) {
    if (!record.choices.includes(vin)) return { ok: false, outcome: "choice_not_allowed" };
  } else if (record.vin !== vin) {
    return { ok: false, outcome: "wrong_vin" };
  }
  return { ok: true, outcome: "confirmed" };
}

export interface MarkVinChallengeResult {
  ok: boolean;
  outcome: VinChallengeOutcome;
}

/** Reject (or otherwise consume) a pending challenge — state-only, no authority. */
export function rejectVinChallenge(
  challengeId: string,
  userId: string,
  nowMs?: number
): MarkVinChallengeResult {
  const nowMsResolved = nowMs ?? Date.now();
  const store = getDefaultVinChallengeStore();
  sweepChallengeStore(store, nowMsResolved);
  const id = String(challengeId ?? "").trim();
  if (!id) return { ok: false, outcome: "challenge_not_found" };
  const record = store.get(id);
  if (!record) return { ok: false, outcome: "challenge_not_found" };
  if (record.userId !== String(userId ?? "").trim()) {
    return { ok: false, outcome: "wrong_user" };
  }
  if (record.status !== "pending") {
    return {
      ok: false,
      outcome: record.status === "confirmed" ? "already_confirmed" : "stale_generation",
    };
  }
  store.set(id, { ...record, status: "rejected" });
  return { ok: true, outcome: "rejected" };
}

/**
 * Ensure the current draft review state has a PENDING server challenge for the
 * authenticated user, scoped by the draft's server-owned scope (minted here
 * when absent). Used by agent/vision candidate-creation choke points and the
 * agent confirm turn.
 */
export function ensureVinReviewChallenge(
  attrs: Record<string, string>,
  input: {
    userId?: string;
    listingId?: string;
    provenance?: VinProvenance;
    nowMs?: number;
  }
): Record<string, string> {
  const userId = String(input.userId ?? "").trim();
  if (!userId) return attrs;

  const state = deriveVinReviewState(attrs as never);
  if (state.status !== "candidate" && state.status !== "conflict") return attrs;

  // Resolve a valid server-owned draft scope (mint when absent/invalid):
  let draftScope = String(attrs.vinDraftScope ?? "").trim();
  if (draftScope) {
    const verified = verifyVinDraftScope(userId, draftScope, input.nowMs);
    if (!verified.ok) draftScope = "";
  }
  if (!draftScope && !input.listingId) {
    const minted = mintVinDraftScope(userId, { nowMs: input.nowMs });
    if (!minted) return attrs;
    draftScope = minted.draftScope;
  }

  const existingId = String(attrs.vinChallenge ?? "").trim();
  if (existingId) {
    const existing = getDefaultVinChallengeStore().get(existingId);
    if (
      existing &&
      existing.status === "pending" &&
      existing.userId === userId &&
      existing.reviewId === String(attrs.vinReviewId ?? "").trim() &&
      ((draftScope && existing.draftScope === draftScope) ||
        (input.listingId && existing.listingId === input.listingId))
    ) {
      const values = state.status === "conflict"
        ? [state.candidate, state.conflictValue].filter((v): v is string => Boolean(v))
        : state.candidate
          ? [state.candidate]
          : [];
      const matches = existing.choices
        ? values.length === existing.choices.length &&
          values.every((v) => existing.choices!.includes(v))
        : existing.vin === state.candidate;
      if (matches) return attrs;
    }
  }

  const values = state.status === "conflict"
    ? [state.candidate, state.conflictValue].filter((v): v is string => Boolean(v))
    : state.candidate
      ? [state.candidate]
      : [];
  const registered = registerVinChallenge({
    userId,
    listingId: input.listingId,
    draftScope: draftScope || undefined,
    values,
    provenance:
      input.provenance ??
      (state.candidateSource as VinProvenance | undefined) ??
      "unknown",
    supersedesChallengeId: existingId || undefined,
    supersedesReviewId: String(attrs.vinReviewId ?? "").trim() || undefined,
    nowMs: input.nowMs,
  });
  if (!registered || registered.outcome !== "registered") return attrs;
  return {
    ...attrs,
    vinReviewId: registered.challenge.reviewId,
    vinChallenge: registered.challenge.challengeId,
    vinDraftScope: draftScope,
  };
}

/** Read-only helper for tests/diagnostics. */
export function describeVinReviewStatus(attrs: Record<string, unknown>): VinReviewStatus {
  return deriveVinReviewState(attrs as never).status;
}
