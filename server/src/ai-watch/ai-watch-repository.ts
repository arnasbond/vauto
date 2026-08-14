/**
 * Production AI Watch repository — PostgreSQL.
 * All user-facing reads/writes: WHERE id = $1 AND user_id = $authenticatedUserId.
 */

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { pool } from "../db.js";
import {
  parseAiWatchNotification,
  parseAiWatchRule,
  type AiWatchNotification,
  type AiWatchRule,
} from "./schema.js";
import { AI_WATCH_VERSION } from "./version.js";
import type {
  CreateWatchInput,
  WatchRepository,
} from "./watch-repository.js";

type Queryable = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
};

type WatchRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  status: string;
  structured_query: unknown;
  target_listing_id: string | null;
  thresholds: unknown;
  created_at: Date | string;
  last_evaluated_at: Date | string | null;
  last_notified_at: Date | string | null;
  watch_version: string;
};

type NotifRow = {
  id: string;
  user_id: string;
  rule_id: string;
  listing_id: string;
  event_fingerprint: string;
  title: string;
  body: string;
  created_at: Date | string;
  watch_version: string;
};

function iso(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToRule(r: WatchRow): AiWatchRule {
  return parseAiWatchRule({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    type: r.type,
    status: r.status,
    structuredQuery: r.structured_query,
    targetListingId: r.target_listing_id ?? undefined,
    thresholds: r.thresholds ?? undefined,
    createdAt: iso(r.created_at)!,
    lastEvaluatedAt: iso(r.last_evaluated_at),
    lastNotifiedAt: iso(r.last_notified_at),
    watchVersion: r.watch_version || AI_WATCH_VERSION,
  });
}

function rowToNotif(r: NotifRow): AiWatchNotification {
  return parseAiWatchNotification({
    id: r.id,
    userId: r.user_id,
    ruleId: r.rule_id,
    listingId: r.listing_id,
    eventFingerprint: r.event_fingerprint,
    title: r.title,
    body: r.body,
    createdAt: iso(r.created_at)!,
    watchVersion: r.watch_version || AI_WATCH_VERSION,
  });
}

export class AiWatchRepository implements WatchRepository {
  private locks = new Map<string, Promise<void>>();

  constructor(private readonly db: Queryable = pool) {}

  async withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      key,
      prev.then(() => next)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async create(input: CreateWatchInput): Promise<AiWatchRule> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const rule = parseAiWatchRule({
      id,
      userId: input.userId,
      name: input.name,
      type: input.type,
      status: "ACTIVE",
      structuredQuery: input.structuredQuery,
      targetListingId: input.targetListingId,
      thresholds: input.thresholds,
      createdAt,
      watchVersion: AI_WATCH_VERSION,
    });
    await this.db.query(
      `INSERT INTO ai_watches (
         id, user_id, name, type, status, structured_query,
         target_listing_id, thresholds, created_at, watch_version
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10)`,
      [
        rule.id,
        rule.userId,
        rule.name,
        rule.type,
        rule.status,
        JSON.stringify(rule.structuredQuery),
        rule.targetListingId ?? null,
        rule.thresholds ? JSON.stringify(rule.thresholds) : null,
        rule.createdAt,
        rule.watchVersion,
      ]
    );
    return rule;
  }

  async getForUser(
    ruleId: string,
    userId: string
  ): Promise<AiWatchRule | null> {
    const res = await this.db.query<WatchRow>(
      `SELECT * FROM ai_watches
       WHERE id = $1 AND user_id = $2 AND status <> 'DELETED'
       LIMIT 1`,
      [ruleId, userId]
    );
    const row = res.rows[0];
    return row ? rowToRule(row) : null;
  }

  async listForUser(userId: string): Promise<AiWatchRule[]> {
    const res = await this.db.query<WatchRow>(
      `SELECT * FROM ai_watches
       WHERE user_id = $1 AND status <> 'DELETED'
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map(rowToRule);
  }

  async listActiveRules(): Promise<AiWatchRule[]> {
    const res = await this.db.query<WatchRow>(
      `SELECT * FROM ai_watches WHERE status = 'ACTIVE'`
    );
    return res.rows.map(rowToRule);
  }

  async updateStatus(
    ruleId: string,
    userId: string,
    status: AiWatchRule["status"]
  ): Promise<AiWatchRule | null> {
    const res = await this.db.query<WatchRow>(
      `UPDATE ai_watches SET status = $3
       WHERE id = $1 AND user_id = $2 AND status <> 'DELETED'
       RETURNING *`,
      [ruleId, userId, status]
    );
    const row = res.rows[0];
    return row ? rowToRule(row) : null;
  }

  async updateRule(
    ruleId: string,
    userId: string,
    patch: Partial<
      Pick<AiWatchRule, "name" | "thresholds" | "structuredQuery" | "status">
    >
  ): Promise<AiWatchRule | null> {
    const current = await this.getForUser(ruleId, userId);
    if (!current) return null;
    const next = parseAiWatchRule({ ...current, ...patch });
    const res = await this.db.query<WatchRow>(
      `UPDATE ai_watches SET
         name = $3,
         status = $4,
         structured_query = $5::jsonb,
         thresholds = $6::jsonb
       WHERE id = $1 AND user_id = $2 AND status <> 'DELETED'
       RETURNING *`,
      [
        ruleId,
        userId,
        next.name,
        next.status,
        JSON.stringify(next.structuredQuery),
        next.thresholds ? JSON.stringify(next.thresholds) : null,
      ]
    );
    const row = res.rows[0];
    return row ? rowToRule(row) : null;
  }

  async softDelete(ruleId: string, userId: string): Promise<boolean> {
    const updated = await this.updateStatus(ruleId, userId, "DELETED");
    return updated != null;
  }

  async markEvaluated(ruleId: string, at: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_watches SET last_evaluated_at = $2 WHERE id = $1`,
      [ruleId, at]
    );
  }

  async markNotified(ruleId: string, at: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_watches SET last_notified_at = $2 WHERE id = $1`,
      [ruleId, at]
    );
  }

  async hasFingerprint(userId: string, fingerprint: string): Promise<boolean> {
    const res = await this.db.query<{ ok: number }>(
      `SELECT 1 AS ok FROM ai_watch_notifications
       WHERE user_id = $1 AND event_fingerprint = $2
       LIMIT 1`,
      [userId, fingerprint]
    );
    return res.rows.length > 0;
  }

  async tryInsertNotification(
    n: Omit<AiWatchNotification, "id" | "watchVersion"> & { id?: string }
  ): Promise<AiWatchNotification | null> {
    // Ownership: rule must belong to same user
    const owned = await this.db.query<{ id: string }>(
      `SELECT id FROM ai_watches WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [n.ruleId, n.userId]
    );
    if (!owned.rows[0]) return null;

    const row = parseAiWatchNotification({
      id: n.id ?? randomUUID(),
      userId: n.userId,
      ruleId: n.ruleId,
      listingId: n.listingId,
      eventFingerprint: n.eventFingerprint,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      watchVersion: AI_WATCH_VERSION,
    });

    try {
      const res = await this.db.query<NotifRow>(
        `INSERT INTO ai_watch_notifications (
           id, user_id, rule_id, listing_id, event_fingerprint,
           title, body, created_at, watch_version
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id, event_fingerprint) DO NOTHING
         RETURNING *`,
        [
          row.id,
          row.userId,
          row.ruleId,
          row.listingId,
          row.eventFingerprint,
          row.title,
          row.body,
          row.createdAt,
          row.watchVersion,
        ]
      );
      if (!res.rows[0]) return null;
      return rowToNotif(res.rows[0]);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "23505" || /unique|duplicate/i.test(msg)) return null;
      throw e;
    }
  }

  async listNotificationsForUser(
    userId: string
  ): Promise<AiWatchNotification[]> {
    const res = await this.db.query<NotifRow>(
      `SELECT * FROM ai_watch_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map(rowToNotif);
  }

  async countNotificationsForUserSince(
    userId: string,
    sinceIso: string
  ): Promise<number> {
    const res = await this.db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM ai_watch_notifications
       WHERE user_id = $1 AND created_at >= $2::timestamptz`,
      [userId, sinceIso]
    );
    return Number(res.rows[0]?.c ?? 0);
  }

  async lastNotificationForRuleListing(
    userId: string,
    ruleId: string,
    listingId: string
  ): Promise<AiWatchNotification | null> {
    const res = await this.db.query<NotifRow>(
      `SELECT * FROM ai_watch_notifications
       WHERE user_id = $1 AND rule_id = $2 AND listing_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, ruleId, listingId]
    );
    const row = res.rows[0];
    return row ? rowToNotif(row) : null;
  }
}

let defaultRepo: AiWatchRepository | null = null;

/** Production singleton (lazy). */
export function getAiWatchRepository(): AiWatchRepository {
  if (!defaultRepo) defaultRepo = new AiWatchRepository();
  return defaultRepo;
}

/** Test helper — inject custom queryable (e.g. PGlite adapter). */
export function createAiWatchRepository(db: Queryable): AiWatchRepository {
  return new AiWatchRepository(db);
}
