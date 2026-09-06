/**
 * E1 — thread service: the server-side conversation boundary.
 *
 * A new turn:
 *   1. load the authoritative thread (or create one);
 *   2. append the USER turn (server-written, from the request's last user msg);
 *   3. construct the model context from the SERVER thread history (user AND
 *      assistant turns — assistant turns are server-owned, never client data);
 *   4. run the real agent pipeline;
 *   5. append the ASSISTANT turn + persist the structured state mutation and
 *      pending confirmation references (optimistic concurrency with retry);
 *   6. return the response + thread metadata.
 *
 * Client history is accepted ONLY for the initial user-turn migration; it is
 * never canonical and can never create/change assistant turns.
 */
import {
  getThreadStore,
} from "./thread-store-instance.js";
import {
  hashAnonSessionToken,
  newThreadRecord,
  mintAnonSessionToken,
  type PendingConfirmationRef,
  type ThreadRecord,
} from "./thread-store.js";
import { runVautoAgent } from "../ai/vauto-agent.js";
import type { VautoAgentRequest, VautoAgentResponse } from "../ai/vauto-agent.js";
import { createHash } from "node:crypto";

export interface ThreadTurnInput {
  threadId?: string | null;
  authUserId?: string | null;
  /**
   * E1.1 — server-issued anonymous session token. REQUIRED to continue an
   * anonymous thread (hashed compare against the store). Never required for
   * authenticated threads (JWT userId is the ownership proof).
   */
  anonSessionToken?: string | null;
  /**
   * E1.2 — stable idempotency key for this user turn. When omitted, the
   * service derives a stable key from (threadId, user text, last message seq)
   * so a retried identical request appends the user turn only once.
   */
  turnId?: string | null;
  /** Client-supplied messages — used ONLY to take the last user message for
   *  the new turn; never to reconstruct canonical history. */
  clientMessages: Array<{ role?: string; text?: string }>;
  context?: Record<string, unknown>;
  pendingImageUrls?: string[];
  /** SSE progress passthrough (status / tool_call events). */
  onEvent?: (event: unknown) => void;
}

export interface ThreadTurnResult {
  response: VautoAgentResponse;
  thread: {
    threadId: string;
    version: number;
    anonSessionToken?: string;
  };
  /** True when the client history was ignored for canonical reconstruction. */
  clientHistoryIgnored: boolean;
}

function lastUserMessage(
  clientMessages: ThreadTurnInput["clientMessages"]
): string {
  const last = [...clientMessages].reverse().find(
    (m) => String(m.role ?? "").toLowerCase() === "user" && String(m.text ?? "").trim()
  );
  return String(last?.text ?? "").trim();
}

function intentFromActions(actions: VautoAgentResponse["actions"]): string {
  const type = String(actions.type ?? "none");
  if (type === "listing_draft") return "sell";
  if (type === "search" || type === "empty_search" || type === "browse_all") {
    return "search";
  }
  return type;
}

function confirmationsFromResponse(
  response: VautoAgentResponse
): PendingConfirmationRef[] {
  const out: PendingConfirmationRef[] = [];
  const actions = response.actions as {
    type?: string;
    pendingActionId?: unknown;
    listingId?: unknown;
  };
  const actionType = String(actions.type ?? "");
  if (
    (actionType === "block_listing" || actionType === "mark_listing_sold") &&
    actions.pendingActionId
  ) {
    out.push({
      id: String(actions.pendingActionId),
      type: actionType,
      targetId: String(actions.listingId ?? ""),
      at: new Date().toISOString(),
    });
  }
  return out;
}

/** Stable turn key: client-supplied or derived from thread+text+seq. */
function turnKeyFor(
  input: ThreadTurnInput,
  userText: string,
  thread: ThreadRecord
): string {
  if (input.turnId) return input.turnId;
  return createHash("sha1")
    .update(`${thread.threadId}|${userText}|${thread.messages.length}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * E1.2 — test seam: the agent runner is swappable so concurrency tests can
 * count executions and inject delays WITHOUT changing the agent pipeline.
 */
let agentRunner: typeof runVautoAgent = runVautoAgent;
export function setThreadAgentForTests(
  fn: typeof runVautoAgent | null
): void {
  agentRunner = fn ?? runVautoAgent;
}

/** E1.4 — a `running` turn older than this is treated as INDETERMINATE
 *  (execution started, outcome unknown → fail-closed, never auto re-run). */
let turnRunningTimeoutMs = 2 * 60_000;
export function setTurnRunningTimeoutForTests(ms: number): void {
  turnRunningTimeoutMs = ms;
}

/** Load-or-create with ownership isolation (E1.1 security boundary). */
async function loadOrCreate(input: ThreadTurnInput): Promise<{
  record: ThreadRecord;
  created: boolean;
  anonSessionToken?: string;
}> {
  const store = getThreadStore();
  if (input.threadId) {
    const existing = await store.get(input.threadId);
    if (existing) {
      if (input.authUserId) {
        // Authenticated ownership via JWT userId only.
        if (existing.ownerUserId && existing.ownerUserId !== input.authUserId) {
          throw new Error("thread_ownership_violation");
        }
        if (!existing.ownerUserId) {
          // Anonymous thread: the authenticated caller must CLAIM it first
          // (POST /threads/:id/claim with the anon token) — no silent hijack.
          throw new Error("thread_ownership_violation");
        }
      } else {
        // Anonymous continuation: the server-issued anon token is REQUIRED.
        // A threadId alone never grants access to an anonymous thread.
        if (existing.ownerUserId) {
          throw new Error("thread_ownership_violation");
        }
        if (!existing.anonSessionTokenHash) {
          throw new Error("thread_ownership_violation");
        }
        if (!input.anonSessionToken) {
          throw new Error("thread_ownership_violation");
        }
        if (
          existing.anonSessionTokenHash !==
          hashAnonSessionToken(input.anonSessionToken)
        ) {
          throw new Error("thread_ownership_violation");
        }
      }
      return { record: existing, created: false };
    }
    // Stale client thread id → self-heal with a fresh thread (fail-closed).
  }
  const anonToken = input.authUserId ? undefined : mintAnonSessionToken();
  const record = newThreadRecord({
    ownerUserId: input.authUserId ?? null,
    anonSessionToken: anonToken ?? null,
  });
  const created = await store.create(record);
  return { record: created, created: true, anonSessionToken: anonToken };
}

export async function runThreadTurn(
  input: ThreadTurnInput
): Promise<ThreadTurnResult> {
  const store = getThreadStore();
  const userText = lastUserMessage(input.clientMessages);
  if (!userText) {
    throw new Error("empty_user_turn");
  }

  const { record: thread, anonSessionToken } = await loadOrCreate(input);
  const turnKey = turnKeyFor(input, userText, thread);

  // ── E1.3/E1.4 — ATOMIC turn reservation + running transition.
  const now = new Date().toISOString();
  const reserve = await store.reserveTurn({
    turnId: turnKey,
    threadId: thread.threadId,
    status: "reserved",
    userText,
    assistantReply: null,
    responseJson: null,
    createdAt: now,
    updatedAt: now,
  });
  if (!reserve.ok) {
    const existing = reserve.existing;
    if (existing.status === "completed" && existing.responseJson) {
      // Idempotent replay — the SAME persisted response. NO model call, NO
      // tool execution.
      const currentRecord = await store.get(thread.threadId);
      return {
        response: existing.responseJson as VautoAgentResponse,
        thread: {
          threadId: thread.threadId,
          version: currentRecord?.version ?? thread.version,
          ...(anonSessionToken ? { anonSessionToken } : {}),
        },
        clientHistoryIgnored: input.clientMessages.length > 1,
      };
    }
    if (existing.status === "indeterminate") {
      throw new Error("turn_indeterminate");
    }
    if (existing.status === "failed_before_execution") {
      // E1.6 — safe explicit retry ONLY because execution provably never
      // started. retryTurn CLAIMS the run ATOMICALLY (failed_before_execution
      // → running): exactly one concurrent caller wins; losers fail closed.
      const retry = await store.retryTurn(thread.threadId, turnKey);
      if (!retry.ok) throw new Error("turn_in_progress");
    } else if (existing.status === "reserved") {
      // reserved ⇒ execution never started ⇒ a replay may CLAIM it via the
      // atomic reserved→running transition.
      const claim = await store.markTurnRunning(thread.threadId, turnKey);
      if (!claim.ok) throw new Error("turn_in_progress");
    } else {
      // running (fresh or timed-out):
      const age = Date.now() - new Date(existing.updatedAt).getTime();
      if (existing.status === "running" && age > turnRunningTimeoutMs) {
        throw new Error("turn_indeterminate");
      }
      throw new Error("turn_in_progress");
    }
  } else {
    const claim = await store.markTurnRunning(thread.threadId, turnKey);
    if (!claim.ok) throw new Error("turn_in_progress");
  }

  // E1.6 INVARIANT — beyond this point the ledger turn for THIS request is
  // atomically `running`: fresh reservation (reserved→running claim),
  // existing reserved (same claim), or failed_before_execution (atomic
  // retryTurn claim). completed / indeterminate / running replays never
  // reach here. NO path to agentRunner exists without an atomically
  // acquired running claim for this request.

  // ── E1.2 — RESERVE FIRST: persist the user turn (idempotent by turnKey)
  // BEFORE running the agent. This mutation is side-effect free, so a safe
  // retry is allowed; the agent/tools pipeline is NEVER blindly re-run.
  // E1.5 — `current !== null` is NOT proof of reservation: the loop exits
  // with execution permission ONLY when a persisted record is PROVEN
  // (update.ok === true, or the same lastTurnId already present).
  let userTurnPersisted: ThreadRecord | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.get(thread.threadId);
    if (!current) {
      const fresh = newThreadRecord({
        ownerUserId: input.authUserId ?? null,
        anonSessionToken: anonSessionToken ?? null,
      });
      await store.create(fresh);
      continue;
    }
    if (current.lastTurnId === turnKey) {
      // Idempotent replay: the user turn is already persisted.
      userTurnPersisted = current;
      break;
    }
    const withUser: ThreadRecord = {
      ...current,
      lastTurnId: turnKey,
      messages: [
        ...current.messages,
        {
          role: "user",
          text: userText,
          at: new Date().toISOString(),
          seq: current.messages.length + 1,
        },
      ],
    };
    const reserved = await store.update(thread.threadId, () => withUser, {
      expectedVersion: current.version,
    });
    if (reserved.ok) {
      userTurnPersisted = reserved.record;
      break;
    }
    // Stale on the pure-append reserve → retry the reservation (no side
    // effects were performed yet).
  }
  if (!userTurnPersisted) {
    // E1.5 — reservation NOT proven ⇒ execution NEVER started. The
    // agent/model/tools are NOT launched; the turn is safely retryable.
    await store.completeTurn(thread.threadId, turnKey, {
      status: "failed_before_execution",
      assistantReply: null,
      responseJson: null,
    });
    throw new Error("thread_update_contention");
  }
  const current = userTurnPersisted;

  // ── Run the agent pipeline EXACTLY ONCE (no retry after side effects).
  const agentRequest: VautoAgentRequest = {
    messages: current.messages.map((m) => ({ role: m.role, text: m.text })),
    authUserId: input.authUserId ?? undefined,
    context: {
      ...(input.context ?? {}),
      threadAuthoritative: true,
      listingDraft:
        (current.listingDraft as Record<string, unknown> | undefined) ??
        (input.context?.listingDraft as Record<string, unknown> | undefined),
    } as VautoAgentRequest["context"],
  };

  let response: VautoAgentResponse;
  try {
    response = await agentRunner(
      agentRequest,
      {
        onEvent: input.onEvent as import("../ai/vauto-agent.js").RunVautoAgentOptions["onEvent"],
      }
    );
  } catch (agentErr) {
    // Execution STARTED (status was `running`) and the outcome is unknown —
    // INDETERMINATE, never automatically re-run.
    await store.completeTurn(thread.threadId, turnKey, {
      status: "indeterminate",
      assistantReply: null,
      responseJson: null,
    });
    throw agentErr;
  }

  // ── Persist the assistant turn + state with the RESERVED version.
  // On stale_version → fail-closed with thread_update_contention. The agent
  // is NOT re-executed; the client may safely retry as a NEW turn request.
  const actions = response.actions as {
    type?: string;
    listingDraft?: Record<string, unknown>;
    [k: string]: unknown;
  };
  const nextDraft =
    actions.type === "listing_draft" && actions.listingDraft
      ? actions.listingDraft
      : current.listingDraft;
  const next: ThreadRecord = {
    ...current,
    listingDraft: nextDraft,
    listingFlowState:
      typeof nextDraft?.listingFlowState === "string"
        ? nextDraft.listingFlowState
        : current.listingFlowState,
    pendingConfirmations: [
      ...current.pendingConfirmations,
      ...confirmationsFromResponse(response),
    ],
    currentIntent: intentFromActions(response.actions),
    messages: [
      ...current.messages,
      {
        role: "assistant",
        text: String(response.reply ?? ""),
        at: new Date().toISOString(),
        seq: current.messages.length + 1,
        actionsType: String(actions.type ?? "none"),
      },
    ],
  };

  const persisted = await store.update(thread.threadId, () => next, {
    expectedVersion: current.version,
  });
  if (!persisted.ok) {
    // Agent/tools ALREADY executed but the thread persist lost the race —
    // INDETERMINATE, never retryable as a silent re-run.
    await store.completeTurn(thread.threadId, turnKey, {
      status: "indeterminate",
      assistantReply: null,
      responseJson: null,
    });
    throw new Error("thread_update_contention");
  }

  // ── E1.4 — completed ledger commit MUST be verified. A client-visible
  // success is returned ONLY when the ledger commit succeeded (or was already
  // committed); any other ledger failure is fail-closed.
  const committed = await store.completeTurn(thread.threadId, turnKey, {
    status: "completed",
    assistantReply: String(response.reply ?? ""),
    responseJson: response,
  });
  if (!committed.ok) {
    const currentTurn = await store.getTurn(thread.threadId, turnKey);
    if (currentTurn?.status === "completed") {
      // Already committed (concurrent completion) — idempotent success.
    } else {
      await store.completeTurn(thread.threadId, turnKey, {
        status: "indeterminate",
        assistantReply: null,
        responseJson: null,
      });
      throw new Error("turn_ledger_conflict");
    }
  }

  return {
    response,
    thread: {
      threadId: persisted.record.threadId,
      version: persisted.record.version,
      ...(anonSessionToken ? { anonSessionToken } : {}),
    },
    clientHistoryIgnored: input.clientMessages.length > 1,
  };
}

export async function claimThreadForUser(
  threadId: string,
  userId: string,
  anonSessionToken: string
): Promise<
  | { ok: true; threadId: string; version: number }
  | { ok: false; reason: "not_found" | "already_bound" | "token_mismatch" }
> {
  const result = await getThreadStore().claimAnonymousThread(
    threadId,
    userId,
    anonSessionToken
  );
  if (!result.ok) return result;
  return { ok: true, threadId: result.record.threadId, version: result.record.version };
}
