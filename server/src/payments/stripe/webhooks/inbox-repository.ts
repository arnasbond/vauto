/**
 * Durable Stripe webhook inbox — UNIQUE stripe_event_id + SKIP LOCKED claim.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TxQueryable } from "../../../transaction/repository.js";
import type { WebhookInboxRow, WebhookInboxStatus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STRIPE_WEBHOOKS_MIGRATION_ID = "046_stripe_webhooks_1.0";
export const STRIPE_WEBHOOKS_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../../migrations/046_stripe_webhooks_1.0.sql"
  ),
  "utf8"
);

type InboxDbRow = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  stripe_object_id: string;
  status: string;
  payload_hash: string;
  attempts: number;
  last_error: string | null;
  livemode: boolean | null;
  created_at: Date | string;
  processed_at: Date | string | null;
};

function iso(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export function mapInboxRow(r: InboxDbRow): WebhookInboxRow {
  return {
    id: r.id,
    stripeEventId: r.stripe_event_id,
    eventType: r.event_type,
    stripeObjectId: r.stripe_object_id,
    status: r.status as WebhookInboxStatus,
    payloadHash: r.payload_hash,
    attempts: Number(r.attempts),
    lastError: r.last_error,
    livemode: r.livemode,
    createdAt: iso(r.created_at)!,
    processedAt: iso(r.processed_at),
  };
}

export function hashWebhookPayload(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export class WebhookInboxRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByStripeEventId(
    stripeEventId: string
  ): Promise<WebhookInboxRow | null> {
    const res = await this.db.query<InboxDbRow>(
      `SELECT * FROM vauto_stripe_webhook_events WHERE stripe_event_id = $1 LIMIT 1`,
      [stripeEventId]
    );
    return res.rows[0] ? mapInboxRow(res.rows[0]) : null;
  }

  /**
   * Insert PENDING. On unique conflict returns existing row (dedup).
   */
  async insertPending(input: {
    stripeEventId: string;
    eventType: string;
    stripeObjectId: string;
    payloadHash: string;
    livemode: boolean | null;
  }): Promise<{ row: WebhookInboxRow; inserted: boolean }> {
    const id = randomUUID();
    try {
      const res = await this.db.query<InboxDbRow>(
        `INSERT INTO vauto_stripe_webhook_events (
           id, stripe_event_id, event_type, stripe_object_id, status,
           payload_hash, attempts, livemode
         ) VALUES ($1,$2,$3,$4,'PENDING',$5,0,$6)
         RETURNING *`,
        [
          id,
          input.stripeEventId,
          input.eventType,
          input.stripeObjectId,
          input.payloadHash,
          input.livemode,
        ]
      );
      return { row: mapInboxRow(res.rows[0]!), inserted: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate|23505/i.test(msg)) throw e;
      const existing = await this.getByStripeEventId(input.stripeEventId);
      if (!existing) throw e;
      return { row: existing, inserted: false };
    }
  }

  /**
   * Claim PENDING/FAILED row for processing (FOR UPDATE SKIP LOCKED).
   * Returns null if another worker holds the lock or row is PROCESSED.
   */
  async claimForProcessing(
    tx: TxQueryable,
    stripeEventId: string
  ): Promise<WebhookInboxRow | null> {
    const res = await tx.query<InboxDbRow>(
      `SELECT * FROM vauto_stripe_webhook_events
       WHERE stripe_event_id = $1
         AND status IN ('PENDING', 'FAILED')
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [stripeEventId]
    );
    if (!res.rows[0]) return null;
    const bumped = await tx.query<InboxDbRow>(
      `UPDATE vauto_stripe_webhook_events
       SET attempts = attempts + 1
       WHERE id = $1
       RETURNING *`,
      [res.rows[0].id]
    );
    return mapInboxRow(bumped.rows[0]!);
  }

  async markProcessed(tx: TxQueryable, id: string): Promise<void> {
    await tx.query(
      `UPDATE vauto_stripe_webhook_events
       SET status = 'PROCESSED',
           processed_at = NOW(),
           last_error = NULL
       WHERE id = $1`,
      [id]
    );
  }

  async markFailed(
    tx: TxQueryable,
    id: string,
    lastError: string
  ): Promise<void> {
    await tx.query(
      `UPDATE vauto_stripe_webhook_events
       SET status = 'FAILED',
           processed_at = NOW(),
           last_error = $2
       WHERE id = $1`,
      [id, lastError.slice(0, 2000)]
    );
  }

  async countByStatus(status: WebhookInboxStatus): Promise<number> {
    const res = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM vauto_stripe_webhook_events WHERE status = $1`,
      [status]
    );
    return Number(res.rows[0]?.c ?? 0);
  }
}
