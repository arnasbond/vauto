/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * Remediated after independent audit (race / exception / durability / LLM-echo).
 *
 * A single, deterministic, server-owned contract for AI tool calls that must
 * NEVER mutate the database on the first (LLM-triggered) call. The tool
 * handler may only *propose* a pending action; a separate, explicitly
 * user-triggered confirmation step (never the LLM) is the sole authority
 * that can invoke `execute`.
 *
 * Explicit state machine (audit remediation #1/#2):
 *
 *   PENDING --(claim: tryClaim, not expired)--> EXECUTING --(execute ok)--> SUCCEEDED
 *      |                                            |
 *      |                                            +--(execute throws)--> FAILED
 *      |
 *      +--(claim attempted after TTL)--> EXPIRED
 *      +--(cancelConsequentialAction)--> CANCELLED
 *
 * SUCCEEDED / FAILED / CANCELLED / EXPIRED are terminal — no transition ever
 * leaves them. `tryClaim` is the ONLY gate that may enter EXECUTING, and it
 * is implemented as a single atomic compare-and-swap in every store
 * implementation (in-memory: synchronous check-and-set with no intervening
 * `await`; PostgreSQL: `UPDATE ... WHERE state = 'PENDING' ... RETURNING *`,
 * see consequential-action-store-postgres.ts). Exactly-once execution is
 * therefore guaranteed by the store, not by this module's control flow.
 *
 * Concurrency (audit remediation #1): a caller that loses the `tryClaim` race
 * because the action is already EXECUTING never returns early with an
 * undefined result. It waits (in-process promise, or a bounded poll as a
 * cross-process fallback — see `awaitTerminalOutcome`) for the SAME terminal
 * row the winner produces, so all concurrent confirmers observe an identical,
 * defined outcome and the mutation is never invoked twice.
 *
 * Exceptions (audit remediation #2): if `execute` throws after the action
 * was claimed, the action is transitioned to the terminal FAILED state
 * (never left stuck in EXECUTING). FAILED is a normal terminal state, not a
 * retryable one — replaying the same pendingActionId will keep returning the
 * same typed failure. To retry, the caller must obtain a fresh proposal
 * (cheap: proposing performs no domain mutation), which is safe because a
 * thrown `execute` is guaranteed (every consumer in
 * routes/consequential-actions.ts performs a single atomic UPDATE) to have
 * made no partial write.
 *
 * Durability (audit remediation #3): this module holds NO domain knowledge
 * and NO storage opinion. Production wiring (server/src/index.ts) calls
 * `markConfirmationBoundaryReady(...)` with a PostgreSQL-backed store
 * (consequential-action-store-postgres.ts) once migrations succeed, so
 * pending actions survive process restarts and stay correct across
 * multiple instances. See that file for the durability rationale.
 *
 * Crash recovery / stale EXECUTING lease (2nd audit, remediation A): a
 * process can crash between claiming (PENDING -> EXECUTING) and persisting
 * the terminal result. `tryClaim` therefore treats EXECUTING as reclaimable
 * once `executingAt` is older than `CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS`
 * — a FRESH lease can never be stolen (the CAS simply does not match), but a
 * STALE one is atomically reclaimed by exactly one caller (same CAS
 * mechanism as the original PENDING -> EXECUTING claim) and re-runs
 * `execute`. This is only safe because `execute` for both action types in
 * this domain (agent-tools.ts / routes/consequential-actions.ts) is written
 * to be idempotent: it re-checks the AUTHORITATIVE current state first
 * (already sold? already banned?) and short-circuits to success without a
 * further mutation or duplicate notification if so. This reclaim mechanism
 * is intentionally generic at the CAS level but is only ever exercised by
 * `ConsequentialActionType` members — it must NEVER be extended to
 * non-idempotent financial/transaction actions.
 *
 * Fencing token (3rd audit, remediation): a lease alone is not enough — a
 * SLOW-BUT-STILL-ALIVE executor can exceed the lease while a second caller
 * legitimately reclaims the row. Both `tryClaim` outcomes (a fresh PENDING
 * claim AND a stale-lease reclaim) mint a brand-new opaque `executionToken`.
 * `complete()` requires the CALLER'S token to exactly match the row's
 * CURRENT token (`WHERE ... AND execution_token = ?`) — so once a row has
 * been reclaimed, the OLD executor's eventual `complete()` call is a no-op
 * CAS miss, never a write. `runExecutorAndComplete` treats that miss as
 * "fenced out": it never fabricates its own terminal outcome from the old
 * (possibly stale/duplicate) execution — it instead observes the CURRENT
 * owner's real terminal result via the same `awaitTerminalOutcome` path a
 * concurrent loser uses, so every caller (winner, reclaimer, or fenced-out
 * original) converges on one authoritative outcome. This token is
 * server-internal bookkeeping only — never exposed to the client or LLM
 * (see agent-tools.ts, which builds `sideEffect` from an explicit allow-list
 * of fields, never a spread of the pending action).
 *
 * Fencing closes the race a lease alone cannot: increasing the lease only
 * lowers the probability of a slow-but-alive executor colliding with a
 * recovery reclaim, it does not make double-completion impossible. Fencing
 * plus the atomic, idempotent domain mutations in
 * atomic-listing-ops.ts (which guarantee at most one real mutation/
 * notification even if two executors' domain calls genuinely overlap) are
 * what make it impossible, together.
 *
 * Bootstrap fail-closed (2nd audit, remediation B): the module starts in an
 * explicit `UNAVAILABLE` boundary state with no store installed at all.
 * `getDefaultPendingActionStore()` THROWS `ConfirmationBoundaryUnavailableError`
 * while UNAVAILABLE — callers (agent-tools.ts, routes/consequential-actions.ts)
 * check `getConfirmationBoundaryState()` first and fail safely (no proposal
 * minted, HTTP 503 `confirmation_boundary_unavailable`) rather than ever
 * touching an in-memory fallback in production. `markConfirmationBoundaryReady`
 * is the ONLY production entrypoint into `READY`, called once, only after
 * `runMigrations()` succeeds (server/src/index.ts) — there is no intermediate
 * "live but wrong store" state to swap away from, so no pending action can
 * ever be orphaned by a later store swap. Tests that need a working boundary
 * call `setDefaultPendingActionStoreForTests(...)` explicitly — production
 * wiring never falls back to this implicitly.
 *
 * LLM-echo (audit remediation #4): this module mints `id` via
 * `randomUUID()` and hands it back to the CALLER of
 * `proposeConsequentialAction` (a tool handler). That id is never parsed
 * from chat text and never authorizes anything by itself —
 * `confirmConsequentialAction` always re-validates the authenticated
 * userId/type/targetId against the stored row regardless of who presents
 * the id. Tool handlers (agent-tools.ts) are responsible for keeping this
 * id out of the text that gets echoed back into the LLM's own context (the
 * Gemini `functionResponse.response` payload) and surfacing it only through
 * the trusted client-side `sideEffect` channel, which is never re-fed to
 * the model. See agent-tools.ts markListingSold / blockListing.
 */

import { randomUUID } from "node:crypto";

export type ConsequentialActionType = "markListingSold" | "blockListing";

/** Short expiration window — long enough for a user to read and click confirm. */
export const CONSEQUENTIAL_ACTION_TTL_MS = 3 * 60 * 1000;

/** Bound on how long a loser of the `tryClaim` race will wait for the winner's terminal result. */
export const CONSEQUENTIAL_ACTION_WAIT_TIMEOUT_MS = 8_000;
const WAIT_POLL_INTERVAL_MS = 20;

/**
 * Bounded execution lease. An EXECUTING row younger than this is NEVER
 * stolen — this must comfortably exceed how long a real `execute` (one or
 * two idempotent UPDATEs) ever takes. An EXECUTING row OLDER than this is
 * assumed to belong to a crashed/abandoned attempt and becomes eligible for
 * exactly-one atomic reclaim (crash recovery — see module docblock).
 */
export const CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS = 15_000;

export type ConsequentialActionState =
  | "PENDING"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface PendingConsequentialAction<
  TType extends ConsequentialActionType = ConsequentialActionType,
> {
  readonly id: string;
  readonly type: TType;
  readonly targetId: string;
  /** Authenticated user who may confirm/cancel this exact pending action. */
  readonly userId: string;
  /** Human-readable explanation shown to the user before they confirm. */
  readonly explanation: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  state: ConsequentialActionState;
  /**
   * Set (and refreshed) every time the row enters/re-enters EXECUTING —
   * including a stale-lease reclaim. `null` while PENDING or terminal.
   * This is the execution lease clock (see `CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS`).
   */
  executingAt: number | null;
  /**
   * Fencing token — minted fresh by `tryClaim` on every successful claim OR
   * stale-lease reclaim; `null` while PENDING or terminal. `complete()`
   * requires an exact match, so a reclaimed row can never be terminalized
   * by the executor that lost the lease. Server-internal only — never
   * serialized into any client/LLM-facing response.
   */
  executionToken: string | null;
  /** Set only once state === "SUCCEEDED". */
  result: unknown;
  /** Set only once state === "FAILED". Safe/generic — never a raw stack trace. */
  errorMessage: string | null;
}

export interface ProposeActionInput<TType extends ConsequentialActionType> {
  type: TType;
  targetId: string;
  userId: string;
  explanation: string;
}

export type ClaimAttempt<TType extends ConsequentialActionType = ConsequentialActionType> =
  | { claimed: true; action: PendingConsequentialAction<TType> }
  | { claimed: false; action: PendingConsequentialAction<TType> | undefined };

export type CancelAttempt<TType extends ConsequentialActionType = ConsequentialActionType> =
  | { cancelled: true; action: PendingConsequentialAction<TType> }
  | { cancelled: false; action: PendingConsequentialAction<TType> | undefined };

/**
 * Result of `complete()`. `written: false` means the CAS did not match —
 * either the row is no longer EXECUTING, or (fencing) the caller's
 * `executionToken` is stale because the lease was reclaimed. Either way the
 * caller MUST NOT treat its own attempted outcome as authoritative; `action`
 * (when present) is the CURRENT row so the caller can observe/await
 * whoever actually owns it now.
 */
export type CompleteAttempt<TType extends ConsequentialActionType = ConsequentialActionType> =
  | { written: true; action: PendingConsequentialAction<TType> }
  | { written: false; action: PendingConsequentialAction<TType> | undefined };

/**
 * In-process synchronization so a same-process loser of `tryClaim` can await
 * the exact winner's terminal result instead of polling. Shared by both the
 * in-memory and PostgreSQL store implementations (see
 * consequential-action-store-postgres.ts) — cross-process losers (a
 * different instance, or a process that restarted mid-execution) fall back
 * to the bounded poll in `awaitTerminalOutcome` below.
 */
export interface WaiterRegistry {
  /** Called by the CAS winner immediately after claiming, before running `execute`. */
  create(id: string): void;
  /** Called by the CAS winner (or its wrapper) once a terminal row exists. */
  settle(id: string, action: PendingConsequentialAction): void;
  /** Called by any loser — returns the winner's promise if one is registered in THIS process. */
  wait(id: string): Promise<PendingConsequentialAction> | undefined;
}

export function createWaiterRegistry(): WaiterRegistry {
  const promises = new Map<string, Promise<PendingConsequentialAction>>();
  const resolvers = new Map<string, (a: PendingConsequentialAction) => void>();
  return {
    create(id) {
      const promise = new Promise<PendingConsequentialAction>((resolve) => {
        resolvers.set(id, resolve);
      });
      promises.set(id, promise);
    },
    settle(id, action) {
      resolvers.get(id)?.(action);
      resolvers.delete(id);
      promises.delete(id);
    },
    wait(id) {
      return promises.get(id);
    },
  };
}

/**
 * Storage contract — every mutating method MUST be atomic (a single
 * compare-and-swap) so exactly-once execution holds regardless of which
 * implementation backs it. Swappable for tests via
 * `createInMemoryPendingActionStore()` (isolated store per test).
 */
export interface PendingActionStore {
  insert(action: PendingConsequentialAction): Promise<void>;
  get(id: string): Promise<PendingConsequentialAction | undefined>;
  /**
   * Atomically attempts PENDING -> EXECUTING, OR reclaims a STALE EXECUTING
   * row (crash recovery — `executingAt` older than
   * `CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS`) by refreshing its lease.
   * Both cases report `claimed: true`; the caller (confirmConsequentialAction)
   * treats a fresh claim and a stale-lease reclaim identically — it always
   * (re-)runs `execute`, which is safe only because `execute` is idempotent.
   *
   * If the row is PENDING but past `expiresAt`, atomically transitions it to
   * EXPIRED instead and reports `claimed: false`. If the row is EXECUTING
   * with a FRESH (unexpired) lease, reports `claimed: false` with the row's
   * CURRENT (unchanged) state — it must NEVER be stolen. Any other state
   * reports `claimed: false` with the current terminal row.
   */
  tryClaim(id: string, now: number): Promise<ClaimAttempt>;
  /**
   * Atomically transitions EXECUTING -> SUCCEEDED|FAILED, GATED on the
   * fencing token minted by the `tryClaim` that produced `executionToken`
   * (`WHERE id = ? AND state = 'EXECUTING' AND execution_token = ?`). If the
   * row has since been reclaimed by a different caller (different token),
   * this is a CAS miss (`written: false`) — never a write, regardless of
   * `outcome`. Terminal, one-shot per token.
   */
  complete(
    id: string,
    executionToken: string,
    outcome:
      | { state: "SUCCEEDED"; result: unknown }
      | { state: "FAILED"; errorMessage: string }
  ): Promise<CompleteAttempt>;
  /** Atomically attempts PENDING -> CANCELLED. Never disturbs any other state. */
  tryCancel(id: string, now: number): Promise<CancelAttempt>;
  /** In-process waiter registry for same-process concurrent-confirm fast path. */
  readonly waiters: WaiterRegistry;
}

export function createInMemoryPendingActionStore(): PendingActionStore {
  const rows = new Map<string, PendingConsequentialAction>();
  const waiters = createWaiterRegistry();

  function clone<T extends ConsequentialActionType>(
    a: PendingConsequentialAction<T>
  ): PendingConsequentialAction<T> {
    return { ...a };
  }

  return {
    waiters,
    async insert(action) {
      rows.set(action.id, { ...action });
    },
    async get(id) {
      const row = rows.get(id);
      return row ? clone(row) : undefined;
    },
    // No `await` before the read-modify-write below — this function body
    // runs to completion within one microtask, so two "concurrent" callers
    // can never interleave inside it. This IS the compare-and-swap.
    async tryClaim(id, now) {
      const row = rows.get(id);
      if (!row) return { claimed: false, action: undefined };
      if (row.state === "PENDING") {
        if (now > row.expiresAt) {
          row.state = "EXPIRED";
          return { claimed: false, action: clone(row) };
        }
        row.state = "EXECUTING";
        row.executingAt = now;
        // Fresh fencing token — the ONLY token that can complete() this
        // claim. See module docblock ("Fencing token").
        row.executionToken = randomUUID();
        waiters.create(id);
        return { claimed: true, action: clone(row) };
      }
      if (row.state === "EXECUTING") {
        const leaseAge = now - (row.executingAt ?? now);
        if (leaseAge < CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS) {
          // Fresh lease — never stolen. Caller waits for the current owner.
          return { claimed: false, action: clone(row) };
        }
        // Stale lease — crash recovery. This whole function body runs with
        // no intervening `await`, so concurrent callers are strictly
        // serialized by the JS event loop: the FIRST one to run this branch
        // refreshes `executingAt` immediately, so every subsequent
        // concurrent caller re-reads the NEW (fresh) `executingAt` above and
        // takes the "fresh lease" branch instead. Exactly one winner.
        //
        // Minting a NEW token here is what fences the original (possibly
        // still slowly running) executor out: its old token can never match
        // again, even if it eventually calls complete().
        row.executingAt = now;
        row.executionToken = randomUUID();
        waiters.create(id);
        return { claimed: true, action: clone(row) };
      }
      return { claimed: false, action: clone(row) };
    },
    async complete(id, executionToken, outcome) {
      const row = rows.get(id);
      if (!row || row.state !== "EXECUTING" || row.executionToken !== executionToken) {
        return { written: false, action: row ? clone(row) : undefined };
      }
      if (outcome.state === "SUCCEEDED") {
        row.state = "SUCCEEDED";
        row.result = outcome.result;
      } else {
        row.state = "FAILED";
        row.errorMessage = outcome.errorMessage;
      }
      const finalRow = clone(row);
      waiters.settle(id, finalRow);
      return { written: true, action: finalRow };
    },
    async tryCancel(id, now) {
      void now;
      const row = rows.get(id);
      if (!row) return { cancelled: false, action: undefined };
      if (row.state !== "PENDING") {
        return { cancelled: false, action: clone(row) };
      }
      row.state = "CANCELLED";
      return { cancelled: true, action: clone(row) };
    },
  };
}

/**
 * Process-wide confirmation-boundary readiness (2nd audit, remediation B).
 *
 * Starts (and stays, until explicitly marked ready) `UNAVAILABLE` with NO
 * store installed. There is deliberately no in-memory fallback reachable
 * from production code: `getDefaultPendingActionStore()` throws while
 * UNAVAILABLE, forcing every call site to either check
 * `getConfirmationBoundaryState()` first (agent-tools.ts,
 * routes/consequential-actions.ts — fail safe with a typed 503/tool error)
 * or accept the thrown error. Production reaches `READY` exactly once, via
 * `markConfirmationBoundaryReady(pgStore)`, called only after
 * `runMigrations()` succeeds (server/src/index.ts). Because the store and
 * the "ready" flag are set together in that single call, there is no
 * observable intermediate state where a request could be served by a
 * transient/wrong store that later gets swapped — nothing can be minted
 * during bootstrap for a later swap to orphan.
 */
export type ConfirmationBoundaryState = "UNAVAILABLE" | "READY";

let boundaryState: ConfirmationBoundaryState = "UNAVAILABLE";
let activeDefaultStore: PendingActionStore | null = null;

export class ConfirmationBoundaryUnavailableError extends Error {
  constructor() {
    super("confirmation_boundary_unavailable");
    this.name = "ConfirmationBoundaryUnavailableError";
  }
}

export function getConfirmationBoundaryState(): ConfirmationBoundaryState {
  return boundaryState;
}

/**
 * Call sites MUST check `getConfirmationBoundaryState() === "READY"` (or
 * catch `ConfirmationBoundaryUnavailableError`) before relying on this —
 * it throws rather than silently handing back an in-memory fallback.
 */
export function getDefaultPendingActionStore(): PendingActionStore {
  if (boundaryState !== "READY" || !activeDefaultStore) {
    throw new ConfirmationBoundaryUnavailableError();
  }
  return activeDefaultStore;
}

/**
 * Production entrypoint — call ONLY after migrations have succeeded
 * (server/src/index.ts). Atomically installs the store AND flips the
 * boundary to READY; never call this more than once per process, and never
 * call it with an in-memory store outside of tests.
 */
export function markConfirmationBoundaryReady(store: PendingActionStore): void {
  activeDefaultStore = store;
  boundaryState = "READY";
}

/**
 * Test-only, explicit opt-in. Unit tests that exercise agent-tools.ts or
 * routes/consequential-actions.ts (which both read the process-wide default)
 * must call this themselves — production wiring never does this implicitly.
 */
export function setDefaultPendingActionStoreForTests(store: PendingActionStore): void {
  activeDefaultStore = store;
  boundaryState = "READY";
}

/** Test-only escape hatch to restore the fail-closed UNAVAILABLE bootstrap state. */
export function resetConfirmationBoundaryForTests(): void {
  activeDefaultStore = null;
  boundaryState = "UNAVAILABLE";
}

export async function proposeConsequentialAction<TType extends ConsequentialActionType>(
  store: PendingActionStore,
  input: ProposeActionInput<TType>,
  opts?: { now?: number; ttlMs?: number }
): Promise<PendingConsequentialAction<TType>> {
  const now = opts?.now ?? Date.now();
  const ttlMs = opts?.ttlMs ?? CONSEQUENTIAL_ACTION_TTL_MS;
  const action: PendingConsequentialAction<TType> = {
    id: randomUUID(),
    type: input.type,
    targetId: input.targetId,
    userId: input.userId,
    explanation: input.explanation,
    createdAt: now,
    expiresAt: now + ttlMs,
    state: "PENDING",
    executingAt: null,
    executionToken: null,
    result: undefined,
    errorMessage: null,
  };
  await store.insert(action);
  return action;
}

export type ConfirmationFailureReason =
  | "not_found"
  | "wrong_user"
  | "cancelled"
  | "type_mismatch"
  | "target_mismatch"
  | "expired"
  | "execution_failed"
  | "still_processing";

export type ConfirmationOutcome<TResult> =
  | { ok: true; replay: boolean; result: TResult }
  | { ok: false; reason: ConfirmationFailureReason; replay?: boolean };

export interface ConfirmParams<TType extends ConsequentialActionType> {
  pendingActionId: string;
  /** Authenticated userId of the CONFIRM request — never client-claimed. */
  userId: string;
  type: TType;
  targetId: string;
}

function scopeMismatch<TType extends ConsequentialActionType>(
  action: PendingConsequentialAction<TType>,
  params: ConfirmParams<TType>
): ConfirmationFailureReason | undefined {
  if (action.userId !== params.userId) return "wrong_user";
  if (action.type !== params.type) return "type_mismatch";
  if (action.targetId !== params.targetId) return "target_mismatch";
  return undefined;
}

function outcomeFromTerminalAction<TResult>(
  action: PendingConsequentialAction,
  replay: boolean
): ConfirmationOutcome<TResult> {
  switch (action.state) {
    case "SUCCEEDED":
      return { ok: true, replay, result: action.result as TResult };
    case "FAILED":
      return { ok: false, reason: "execution_failed", replay };
    case "CANCELLED":
      return { ok: false, reason: "cancelled" };
    case "EXPIRED":
      return { ok: false, reason: "expired" };
    default:
      // PENDING/EXECUTING after the wait budget elapsed — never fabricate a
      // result; tell the caller it is safe to retry the SAME confirm call.
      return { ok: false, reason: "still_processing", replay };
  }
}

/**
 * Waits for a same-process winner via the in-memory waiter registry when
 * available (fast, deterministic — used by every unit test and by the
 * single-instance production deployment). Falls back to a short bounded
 * poll of `store.get()` for cross-process races (a different instance, or a
 * process that restarted mid-execution) so it still NEVER returns undefined
 * and NEVER re-invokes `execute`.
 */
async function awaitTerminalOutcome(
  store: PendingActionStore,
  actionId: string,
  now: number
): Promise<PendingConsequentialAction | undefined> {
  const waiterPromise = store.waiters.wait(actionId);
  if (waiterPromise) {
    const timeout = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), CONSEQUENTIAL_ACTION_WAIT_TIMEOUT_MS)
    );
    const result = await Promise.race([waiterPromise, timeout]);
    if (result) return result;
  }

  const deadline = now + CONSEQUENTIAL_ACTION_WAIT_TIMEOUT_MS;
  for (;;) {
    const row = await store.get(actionId);
    if (!row) return undefined;
    if (row.state !== "PENDING" && row.state !== "EXECUTING") return row;
    if (Date.now() > deadline) return row; // still EXECUTING — reported as "still_processing"
    await new Promise((r) => setTimeout(r, WAIT_POLL_INTERVAL_MS));
  }
}

/**
 * This executor was fenced out — its `executionToken` no longer matches the
 * row (the lease was reclaimed by a different caller, who may have already
 * finished, or may still be running). It must NEVER fabricate its own
 * terminal outcome from its own (possibly stale/duplicate) execution — it
 * observes the CURRENT owner's real terminal result via the exact same
 * wait/poll path a concurrent `tryClaim` loser uses.
 */
async function observeFencedOutcome<TResult>(
  store: PendingActionStore,
  actionId: string
): Promise<ConfirmationOutcome<TResult>> {
  const terminal = await awaitTerminalOutcome(store, actionId, Date.now());
  if (!terminal) return { ok: false, reason: "not_found" };
  return outcomeFromTerminalAction<TResult>(terminal, true);
}

async function runExecutorAndComplete<TType extends ConsequentialActionType, TResult>(
  store: PendingActionStore,
  action: PendingConsequentialAction<TType>,
  execute: (action: PendingConsequentialAction<TType>) => Promise<TResult>
): Promise<ConfirmationOutcome<TResult>> {
  // Minted by the `tryClaim` that produced this exact `action` — required,
  // defensive-only fallback below covers a theoretically-impossible null.
  const token = action.executionToken;
  try {
    const result = await execute(action);
    if (token) {
      const attempt = await store.complete(action.id, token, { state: "SUCCEEDED", result });
      if (attempt.written) return outcomeFromTerminalAction<TResult>(attempt.action, false);
    }
    // Fenced out AFTER successfully executing: never report our own result
    // as authoritative — some other caller now owns (or already finished)
    // this row.
    return observeFencedOutcome<TResult>(store, action.id);
  } catch (e) {
    // Sanitized/generic only — never persist a raw exception/DB message.
    // Full detail goes to server logs (observability), never to the row.
    console.error(
      `[consequential-action] execute() threw for ${action.id} (${action.type}):`,
      e instanceof Error ? e.stack ?? e.message : e
    );
    const errorMessage = "execution_failed";
    if (token) {
      const attempt = await store.complete(action.id, token, { state: "FAILED", errorMessage });
      if (attempt.written) return outcomeFromTerminalAction<TResult>(attempt.action, false);
    }
    return observeFencedOutcome<TResult>(store, action.id);
  }
}

/**
 * The one deterministic authority that may invoke `execute`. Never call this
 * from LLM/tool-parsing code — only from a dedicated, explicitly-triggered
 * confirmation surface (HTTP endpoint / button click).
 *
 * Guarantees (see module docblock for the full state machine):
 *  - `execute` is invoked AT MOST ONCE per pendingActionId, ever.
 *  - Every caller (winner or concurrent loser) receives a defined, terminal
 *    outcome — never `undefined`, never a silently-dropped promise.
 *  - A thrown `execute` produces a typed terminal FAILED outcome; the action
 *    is never left "consumed" without a result.
 */
export async function confirmConsequentialAction<
  TType extends ConsequentialActionType,
  TResult,
>(
  store: PendingActionStore,
  params: ConfirmParams<TType>,
  execute: (action: PendingConsequentialAction<TType>) => Promise<TResult>,
  opts?: { now?: number }
): Promise<ConfirmationOutcome<TResult>> {
  const now = opts?.now ?? Date.now();

  // Cheap pre-check for a friendly not_found/scope error before touching the
  // atomic claim path. Advisory only — the claim below re-validates scope
  // against whatever row it actually reads, so a race here can never cause
  // a wrong-user execution.
  const precheck = await store.get(params.pendingActionId);
  if (!precheck) return { ok: false, reason: "not_found" };
  const precheckMismatch = scopeMismatch(precheck as PendingConsequentialAction<TType>, params);
  if (precheckMismatch) return { ok: false, reason: precheckMismatch };
  if (precheck.state === "CANCELLED") return { ok: false, reason: "cancelled" };

  const attempt = await store.tryClaim(params.pendingActionId, now);
  const row = attempt.action as PendingConsequentialAction<TType> | undefined;
  if (!row) return { ok: false, reason: "not_found" };

  const mismatch = scopeMismatch(row, params);
  if (mismatch) return { ok: false, reason: mismatch };

  if (attempt.claimed) {
    return runExecutorAndComplete(store, row, execute);
  }

  if (row.state === "EXECUTING") {
    const terminal = await awaitTerminalOutcome(store, params.pendingActionId, now);
    if (!terminal) return { ok: false, reason: "not_found" };
    return outcomeFromTerminalAction<TResult>(terminal, true);
  }

  // Already terminal (SUCCEEDED / FAILED / CANCELLED / EXPIRED) by the time
  // we attempted to claim — replay-safe, deterministic, no re-execution.
  return outcomeFromTerminalAction<TResult>(row, true);
}

export type CancelFailureReason = "not_found" | "wrong_user" | "already_consumed";
export type CancelOutcome = { ok: true } | { ok: false; reason: CancelFailureReason };

export async function cancelConsequentialAction(
  store: PendingActionStore,
  params: { pendingActionId: string; userId: string },
  opts?: { now?: number }
): Promise<CancelOutcome> {
  const now = opts?.now ?? Date.now();
  const precheck = await store.get(params.pendingActionId);
  if (!precheck) return { ok: false, reason: "not_found" };
  if (precheck.userId !== params.userId) return { ok: false, reason: "wrong_user" };

  const attempt = await store.tryCancel(params.pendingActionId, now);
  if (attempt.cancelled) return { ok: true };

  const row = attempt.action;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.userId !== params.userId) return { ok: false, reason: "wrong_user" };
  if (row.state === "CANCELLED" || row.state === "EXPIRED") return { ok: true };
  // PENDING should be unreachable here (tryCancel would have claimed it) —
  // any other state (EXECUTING/SUCCEEDED/FAILED) means the write already
  // started or finished and cancellation can no longer prevent it.
  return { ok: false, reason: "already_consumed" };
}
