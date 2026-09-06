/**
 * E1 — server-authoritative conversation thread store.
 *
 * The thread store is MEMORY ONLY — it is NOT a planner and NOT a state
 * machine. It persists: the conversation (user + assistant turns, assistant
 * turns written exclusively by the server), the structured marketplace state
 * snapshot (listing draft / search context), pending confirmation references
 * and version metadata. Intent is stored for observability only — nothing
 * here decides "what the user wants".
 *
 * Security: a thread is bound to (ownerUserId | anonSessionTokenHash). The
 * client can never forge assistant messages, confirmations, trusted facts,
 * owner identity or privileged roles — the store only accepts mutations
 * performed by the server pipeline.
 */
import { createHash, randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";

export interface ThreadMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
  seq: number;
  /** Last action snapshot for assistant turns (structured, display-only). */
  actionsType?: string;
}

export interface PendingConfirmationRef {
  id: string;
  type: string;
  targetId: string;
  at: string;
}

export interface ThreadRecord {
  threadId: string;
  ownerUserId: string | null;
  anonSessionTokenHash: string | null;
  version: number;
  messages: ThreadMessage[];
  /** E1.2 — idempotency key of the last appended user turn (stable per turn). */
  lastTurnId: string | null;
  listingDraft: Record<string, unknown> | null;
  listingFlowState: string | null;
  searchContext: Record<string, unknown> | null;
  pendingConfirmations: PendingConfirmationRef[];
  currentIntent: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TurnStatus =
  | "reserved"
  | "running"
  | "completed"
  | "failed_before_execution"
  | "indeterminate";

/**
 * E1.3/E1.4 — server-authoritative TURN ledger (exactly-once semantics).
 * Status semantics:
 *  - reserved: the turn row exists; agent/tool execution provably NOT started;
 *  - running: execution started (set atomically right before the pipeline);
 *  - completed: the persisted assistant result exists — replayable verbatim;
 *  - failed_before_execution: failed before execution started — safe to retry;
 *  - indeterminate: execution started, outcome unknown — FAIL-CLOSED, never
 *    automatically re-run.
 * Reservation is ATOMIC per (thread_id, turn_id); production Postgres enforces
 * DB-level uniqueness via the composite primary key.
 */
export interface TurnRecord {
  turnId: string;
  threadId: string;
  status: TurnStatus;
  userText: string;
  assistantReply: string | null;
  responseJson: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export type ThreadUpdateResult =
  | { ok: true; record: ThreadRecord }
  | { ok: false; reason: "not_found" | "stale_version" };

export type TurnReserveResult =
  | { ok: true; turn: TurnRecord; created: boolean }
  | { ok: false; reason: "duplicate"; existing: TurnRecord };

export type TurnCompleteResult =
  | { ok: true; turn: TurnRecord }
  | { ok: false; reason: "not_found" | "stale_status" };

export interface ThreadStore {
  get(threadId: string): Promise<ThreadRecord | null>;
  create(record: ThreadRecord): Promise<ThreadRecord>;
  update(
    threadId: string,
    mutate: (record: ThreadRecord) => ThreadRecord,
    opts?: { expectedVersion?: number }
  ): Promise<ThreadUpdateResult>;
  claimAnonymousThread(
    threadId: string,
    userId: string,
    anonSessionToken: string
  ): Promise<
    | { ok: true; record: ThreadRecord }
    | { ok: false; reason: "not_found" | "already_bound" | "token_mismatch" }
  >;
  /** E1.3 — ATOMIC turn reservation: exactly one caller wins per turnId. */
  reserveTurn(turn: TurnRecord): Promise<TurnReserveResult>;
  getTurn(threadId: string, turnId: string): Promise<TurnRecord | null>;
  completeTurn(
    threadId: string,
    turnId: string,
    patch: { status: TurnStatus; assistantReply: string | null; responseJson: unknown | null }
  ): Promise<TurnCompleteResult>;
  /** E1.4 — atomic reserved→running transition (execution starts HERE). */
  markTurnRunning(threadId: string, turnId: string): Promise<TurnCompleteResult>;
  /** E1.6 — ATOMIC explicit-retry claim: failed_before_execution→running in
   *  ONE store action. Exactly one concurrent caller wins the right to run;
   *  losers get {ok:false} and must fail closed (turn_in_progress). Safe ONLY
   *  because execution provably never started. */
  retryTurn(threadId: string, turnId: string): Promise<TurnReserveResult>;
}

export function mintThreadId(): string {
  return `thr_${randomBytes(12).toString("hex")}`;
}

export function mintAnonSessionToken(): string {
  return randomBytes(24).toString("hex");
}

/** Hash an anonymous session token for storage (never store the raw token). */
export function hashAnonSessionToken(token: string): string {
  return createHash("sha256").update(`vauto-thread:${token}`).digest("hex");
}

export function newThreadRecord(input: {
  ownerUserId?: string | null;
  anonSessionToken?: string | null;
}): ThreadRecord {
  const now = new Date().toISOString();
  return {
    threadId: mintThreadId(),
    ownerUserId: input.ownerUserId ?? null,
    anonSessionTokenHash: input.anonSessionToken
      ? hashAnonSessionToken(input.anonSessionToken)
      : null,
    version: 1,
    messages: [],
    lastTurnId: null,
    listingDraft: null,
    listingFlowState: null,
    searchContext: null,
    pendingConfirmations: [],
    currentIntent: null,
    createdAt: now,
    updatedAt: now,
  };
}

function cloneRecord(record: ThreadRecord): ThreadRecord {
  return {
    ...record,
    messages: record.messages.map((m) => ({ ...m })),
    listingDraft: record.listingDraft
      ? JSON.parse(JSON.stringify(record.listingDraft))
      : null,
    searchContext: record.searchContext
      ? JSON.parse(JSON.stringify(record.searchContext))
      : null,
    pendingConfirmations: record.pendingConfirmations.map((p) => ({ ...p })),
  };
}

/** Transitional process-local adapter (E1). Replaced by the Postgres adapter
 *  once migration 066/067 is applied — never the final production solution. */
export class InMemoryThreadStore implements ThreadStore {
  private readonly map = new Map<string, ThreadRecord>();
  private readonly turns = new Map<string, Map<string, TurnRecord>>();

  async get(threadId: string): Promise<ThreadRecord | null> {
    const record = this.map.get(threadId);
    return record ? cloneRecord(record) : null;
  }

  async create(record: ThreadRecord): Promise<ThreadRecord> {
    if (this.map.has(record.threadId)) {
      throw new Error(`thread ${record.threadId} already exists`);
    }
    const stored = cloneRecord(record);
    this.map.set(record.threadId, stored);
    return cloneRecord(stored);
  }

  async update(
    threadId: string,
    mutate: (record: ThreadRecord) => ThreadRecord,
    opts?: { expectedVersion?: number }
  ): Promise<ThreadUpdateResult> {
    const current = this.map.get(threadId);
    if (!current) return { ok: false, reason: "not_found" };
    if (opts?.expectedVersion != null && current.version !== opts.expectedVersion) {
      return { ok: false, reason: "stale_version" };
    }
    const next = mutate(cloneRecord(current));
    const bumped: ThreadRecord = {
      ...next,
      version: next.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.map.set(threadId, cloneRecord(bumped));
    return { ok: true, record: cloneRecord(bumped) };
  }

  async claimAnonymousThread(
    threadId: string,
    userId: string,
    anonSessionToken: string
  ): Promise<
    | { ok: true; record: ThreadRecord }
    | { ok: false; reason: "not_found" | "already_bound" | "token_mismatch" }
  > {
    const current = this.map.get(threadId);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.ownerUserId) return { ok: false, reason: "already_bound" };
    if (current.anonSessionTokenHash !== hashAnonSessionToken(anonSessionToken)) {
      return { ok: false, reason: "token_mismatch" };
    }
    const next: ThreadRecord = {
      ...cloneRecord(current),
      ownerUserId: userId,
      anonSessionTokenHash: null,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.map.set(threadId, cloneRecord(next));
    return { ok: true, record: cloneRecord(next) };
  }

  private turnMap(threadId: string): Map<string, TurnRecord> {
    let m = this.turns.get(threadId);
    if (!m) {
      m = new Map();
      this.turns.set(threadId, m);
    }
    return m;
  }

  async reserveTurn(turn: TurnRecord): Promise<TurnReserveResult> {
    const m = this.turnMap(turn.threadId);
    const existing = m.get(turn.turnId);
    if (existing) {
      return { ok: false, reason: "duplicate", existing: { ...existing } };
    }
    m.set(turn.turnId, { ...turn });
    return { ok: true, turn: { ...turn }, created: true };
  }

  async getTurn(threadId: string, turnId: string): Promise<TurnRecord | null> {
    const existing = this.turnMap(threadId).get(turnId);
    return existing ? { ...existing } : null;
  }

  async completeTurn(
    threadId: string,
    turnId: string,
    patch: { status: TurnStatus; assistantReply: string | null; responseJson: unknown | null }
  ): Promise<TurnCompleteResult> {
    const m = this.turnMap(threadId);
    const existing = m.get(turnId);
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.status !== "reserved" && existing.status !== "running") {
      return { ok: false, reason: "stale_status" };
    }
    const next: TurnRecord = {
      ...existing,
      status: patch.status,
      assistantReply: patch.assistantReply,
      responseJson: patch.responseJson,
      updatedAt: new Date().toISOString(),
    };
    m.set(turnId, next);
    return { ok: true, turn: { ...next } };
  }

  async retryTurn(threadId: string, turnId: string): Promise<TurnReserveResult> {
    // E1.6 — the ENTIRE transition is synchronous (no await between the
    // status check and the set) → atomic in the single-threaded runtime.
    const m = this.turnMap(threadId);
    const existing = m.get(turnId);
    if (!existing) return { ok: false, reason: "duplicate", existing: existing! };
    if (existing.status !== "failed_before_execution") {
      return { ok: false, reason: "duplicate", existing: { ...existing } };
    }
    const next: TurnRecord = {
      ...existing,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    m.set(turnId, next);
    return { ok: true, turn: { ...next }, created: false };
  }

  async markTurnRunning(threadId: string, turnId: string): Promise<TurnCompleteResult> {
    const m = this.turnMap(threadId);
    const existing = m.get(turnId);
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.status !== "reserved") return { ok: false, reason: "stale_status" };
    const next: TurnRecord = {
      ...existing,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    m.set(turnId, next);
    return { ok: true, turn: { ...next } };
  }
}

/** Minimal row-array query interface (matches the repository `query` helper). */
export interface ThreadQueryable {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<T[]>;
}

/**
 * Production persistence adapter (Postgres). PREPARED ONLY — it requires
 * migration 066 (not applied anywhere yet). Wired explicitly by operators
 * after the migration is reviewed; the default runtime store remains the
 * transitional in-memory adapter.
 */
export class PostgresThreadStore implements ThreadStore {
  constructor(private readonly db: ThreadQueryable) {}

  async get(threadId: string): Promise<ThreadRecord | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM agent_threads WHERE id = $1`,
      [threadId]
    );
    const row = rows[0];
    if (!row) return null;
    return rowToThread(row);
  }

  async create(record: ThreadRecord): Promise<ThreadRecord> {
    await this.db.query(
      `INSERT INTO agent_threads
         (id, owner_user_id, anon_session_token_hash, version, messages,
          listing_draft, listing_flow_state, search_context,
          pending_confirmations, current_intent, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,
      [
        record.threadId,
        record.ownerUserId,
        record.anonSessionTokenHash,
        record.version,
        JSON.stringify(record.messages),
        record.listingDraft ? JSON.stringify(record.listingDraft) : null,
        record.listingFlowState,
        record.searchContext ? JSON.stringify(record.searchContext) : null,
        JSON.stringify(record.pendingConfirmations),
        record.currentIntent,
        record.createdAt,
        record.updatedAt,
      ]
    );
    return record;
  }

  async update(
    threadId: string,
    mutate: (record: ThreadRecord) => ThreadRecord,
    opts?: { expectedVersion?: number }
  ): Promise<ThreadUpdateResult> {
    const current = await this.get(threadId);
    if (!current) return { ok: false, reason: "not_found" };
    if (opts?.expectedVersion != null && current.version !== opts.expectedVersion) {
      return { ok: false, reason: "stale_version" };
    }
    const next = mutate(current);
    const bumped: ThreadRecord = {
      ...next,
      version: next.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.db.query<Record<string, unknown>>(
      `UPDATE agent_threads
          SET owner_user_id = $2, anon_session_token_hash = $3, version = version + 1,
              messages = $4::jsonb, listing_draft = $5::jsonb, listing_flow_state = $6,
              search_context = $7::jsonb, pending_confirmations = $8::jsonb,
              current_intent = $9, updated_at = $10
        WHERE id = $1 AND version = $11
        RETURNING *`,
      [
        threadId,
        bumped.ownerUserId,
        bumped.anonSessionTokenHash,
        JSON.stringify(bumped.messages),
        bumped.listingDraft ? JSON.stringify(bumped.listingDraft) : null,
        bumped.listingFlowState,
        bumped.searchContext ? JSON.stringify(bumped.searchContext) : null,
        JSON.stringify(bumped.pendingConfirmations),
        bumped.currentIntent,
        bumped.updatedAt,
        current.version,
      ]
    );
    if (!result[0]) return { ok: false, reason: "stale_version" };
    return { ok: true, record: rowToThread(result[0]) };
  }

  async claimAnonymousThread(
    threadId: string,
    userId: string,
    anonSessionToken: string
  ): Promise<
    | { ok: true; record: ThreadRecord }
    | { ok: false; reason: "not_found" | "already_bound" | "token_mismatch" }
  > {
    // E1.2 — ATOMIC claim: ONE conditional UPDATE owns the decision
    // (id = threadId AND owner_user_id IS NULL AND hash = expected). No
    // read/check/write TOCTOU window exists.
    const expectedHash = hashAnonSessionToken(anonSessionToken);
    const rows = await this.db.query<Record<string, unknown>>(
      `UPDATE agent_threads
          SET owner_user_id = $2, anon_session_token_hash = NULL,
              version = version + 1, updated_at = $3
        WHERE id = $1 AND owner_user_id IS NULL AND anon_session_token_hash = $4
        RETURNING *`,
      [threadId, userId, new Date().toISOString(), expectedHash]
    );
    if (rows[0]) {
      return { ok: true, record: rowToThread(rows[0]) };
    }
    // Diagnostic read ONLY (the claim decision already happened atomically
    // above) — used to report the reason, never to re-attempt ownership.
    const current = await this.get(threadId);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.ownerUserId) return { ok: false, reason: "already_bound" };
    return { ok: false, reason: "token_mismatch" };
  }

  async reserveTurn(turn: TurnRecord): Promise<TurnReserveResult> {
    // E1.3 — ATOMIC reservation: INSERT ... ON CONFLICT DO NOTHING; exactly
    // one caller inserts the (thread_id, turn_id) row.
    const rows = await this.db.query<Record<string, unknown>>(
      `INSERT INTO agent_turns
         (thread_id, turn_id, status, user_text, assistant_reply, response_json, created_at, updated_at)
       VALUES ($1, $2, 'reserved', $3, NULL, NULL, $4, $4)
       ON CONFLICT (thread_id, turn_id) DO NOTHING
       RETURNING *`,
      [turn.threadId, turn.turnId, turn.userText, turn.createdAt]
    );
    if (rows[0]) {
      return { ok: true, turn: rowToTurn(rows[0]), created: true };
    }
    const existing = await this.getTurn(turn.threadId, turn.turnId);
    return {
      ok: false,
      reason: "duplicate",
      existing: existing!,
    };
  }

  async getTurn(threadId: string, turnId: string): Promise<TurnRecord | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM agent_turns WHERE thread_id = $1 AND turn_id = $2`,
      [threadId, turnId]
    );
    return rows[0] ? rowToTurn(rows[0]) : null;
  }

  async completeTurn(
    threadId: string,
    turnId: string,
    patch: { status: TurnStatus; assistantReply: string | null; responseJson: unknown | null }
  ): Promise<TurnCompleteResult> {
    const rows = await this.db.query<Record<string, unknown>>(
      `UPDATE agent_turns
          SET status = $3, assistant_reply = $4, response_json = $5::jsonb, updated_at = $6
        WHERE thread_id = $1 AND turn_id = $2 AND status IN ('reserved', 'running')
        RETURNING *`,
      [
        threadId,
        turnId,
        patch.status,
        patch.assistantReply,
        patch.responseJson ? JSON.stringify(patch.responseJson) : null,
        new Date().toISOString(),
      ]
    );
    if (rows[0]) return { ok: true, turn: rowToTurn(rows[0]) };
    const existing = await this.getTurn(threadId, turnId);
    if (!existing) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "stale_status" };
  }

  async retryTurn(threadId: string, turnId: string): Promise<TurnReserveResult> {
    // E1.6 — single conditional UPDATE: the failed_before_execution→running
    // claim is atomic at the DB level (row lock + WHERE status filter).
    const rows = await this.db.query<Record<string, unknown>>(
      `UPDATE agent_turns
          SET status = 'running', updated_at = $3
        WHERE thread_id = $1 AND turn_id = $2 AND status = 'failed_before_execution'
        RETURNING *`,
      [threadId, turnId, new Date().toISOString()]
    );
    if (rows[0]) return { ok: true, turn: rowToTurn(rows[0]), created: false };
    const existing = await this.getTurn(threadId, turnId);
    return { ok: false, reason: "duplicate", existing: existing! };
  }

  async markTurnRunning(threadId: string, turnId: string): Promise<TurnCompleteResult> {
    const rows = await this.db.query<Record<string, unknown>>(
      `UPDATE agent_turns
          SET status = 'running', updated_at = $3
        WHERE thread_id = $1 AND turn_id = $2 AND status = 'reserved'
        RETURNING *`,
      [threadId, turnId, new Date().toISOString()]
    );
    if (rows[0]) return { ok: true, turn: rowToTurn(rows[0]) };
    const existing = await this.getTurn(threadId, turnId);
    if (!existing) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "stale_status" };
  }
}

function rowToThread(row: Record<string, unknown>): ThreadRecord {
  return {
    threadId: String(row.id),
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    anonSessionTokenHash: (row.anon_session_token_hash as string | null) ?? null,
    version: Number(row.version),
    messages: (row.messages as ThreadMessage[]) ?? [],
    lastTurnId: (row.last_turn_id as string | null) ?? null,
    listingDraft: (row.listing_draft as Record<string, unknown> | null) ?? null,
    listingFlowState: (row.listing_flow_state as string | null) ?? null,
    searchContext: (row.search_context as Record<string, unknown> | null) ?? null,
    pendingConfirmations: (row.pending_confirmations as PendingConfirmationRef[]) ?? [],
    currentIntent: (row.current_intent as string | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function rowToTurn(row: Record<string, unknown>): TurnRecord {
  return {
    turnId: String(row.turn_id),
    threadId: String(row.thread_id),
    status: String(row.status) as TurnStatus,
    userText: String(row.user_text ?? ""),
    assistantReply: (row.assistant_reply as string | null) ?? null,
    responseJson: (row.response_json as unknown | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}
