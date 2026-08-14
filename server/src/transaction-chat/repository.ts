/**
 * Transaction Chat repository — participant IDOR + timeline queries.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TxQueryable } from "../transaction/repository.js";
import { TransactionRepository } from "../transaction/repository.js";
import { runQueryableTransaction } from "../transaction/tx-connection.js";
import {
  ChatAuthError,
  ChatNotFoundError,
  type DomainEventType,
  type MessageType,
  type TimelineItem,
  type TransactionMessageRow,
} from "./types.js";
import { escapeHtml } from "./schema.js";
import { TRANSACTION_CHAT_VERSION } from "./version.js";
import type { DomainEventWrite } from "./event-adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TRANSACTION_CHAT_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/041_transaction_chat_1.0.sql"
  ),
  "utf8"
);

export const TRANSACTION_CHAT_MIGRATION_ID = "041_transaction_chat_1.0";

type MsgRow = {
  id: string;
  transaction_id: string;
  sender_id: string | null;
  message_type: string;
  event_type: string | null;
  text: string;
  payload_json: Record<string, unknown> | string;
  idempotency_key: string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  chat_version: string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function parsePayload(
  p: Record<string, unknown> | string
): Record<string, unknown> {
  if (typeof p === "string") {
    try {
      return JSON.parse(p) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return p ?? {};
}

function mapRow(r: MsgRow): TransactionMessageRow {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    senderId: r.sender_id,
    messageType: r.message_type as MessageType,
    eventType: (r.event_type as DomainEventType | null) ?? null,
    text: r.text,
    payloadJson: parsePayload(r.payload_json),
    idempotencyKey: r.idempotency_key,
    deletedAt: r.deleted_at == null ? null : iso(r.deleted_at),
    createdAt: iso(r.created_at),
    chatVersion: TRANSACTION_CHAT_VERSION,
  };
}

export function toTimelineItem(row: TransactionMessageRow): TimelineItem {
  return {
    id: row.id,
    transactionId: row.transactionId,
    messageType: row.messageType,
    eventType: row.eventType,
    senderId: row.senderId,
    text: row.text,
    textSafe: escapeHtml(row.text),
    payload: row.payloadJson,
    createdAt: row.createdAt,
    chatVersion: TRANSACTION_CHAT_VERSION,
  };
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(
  cursor: string
): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("|");
    if (idx <= 0) return null;
    return { createdAt: raw.slice(0, idx), id: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

export class TransactionChatRepository {
  private readonly rootDb: TxQueryable;
  private db: TxQueryable;
  private txRepo: TransactionRepository;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(db: TxQueryable) {
    this.rootDb = db;
    this.db = db;
    this.txRepo = new TransactionRepository(db);
  }

  private async withTx<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.chain;
    this.chain = prev.then(() => gate);
    await prev.catch(() => {});
    try {
      return await runQueryableTransaction(this.rootDb, async (txDb) => {
        const prevDb = this.db;
        const prevRepo = this.txRepo;
        this.db = txDb;
        this.txRepo = new TransactionRepository(txDb);
        try {
          return await fn();
        } finally {
          this.db = prevDb;
          this.txRepo = prevRepo;
        }
      });
    } finally {
      release();
    }
  }

  /** Strict participant check — stranger → 404 (no existence leak) or 403. */
  async assertParticipant(
    transactionId: string,
    userId: string,
    mode: "404" | "403" = "404"
  ) {
    const tx = await this.txRepo.getById(transactionId);
    if (!tx) {
      throw new ChatNotFoundError(transactionId);
    }
    if (userId !== tx.buyerId && userId !== tx.sellerId) {
      if (mode === "404") throw new ChatNotFoundError(transactionId);
      throw new ChatAuthError();
    }
    return tx;
  }

  async insertUserMessage(input: {
    transactionId: string;
    senderId: string;
    text: string;
    idempotencyKey: string;
    attachmentIds?: string[];
  }): Promise<{ row: TransactionMessageRow; idempotentReplay: boolean }> {
    return this.withTx(async () => {
      await this.assertParticipant(input.transactionId, input.senderId);

      const existing = await this.db.query<MsgRow>(
        `SELECT * FROM vauto_transaction_messages
         WHERE transaction_id = $1 AND sender_id = $2 AND idempotency_key = $3
         LIMIT 1`,
        [input.transactionId, input.senderId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        return { row: mapRow(existing.rows[0]), idempotentReplay: true };
      }

      const id = randomUUID();
      const payload = {
        attachmentIds: input.attachmentIds ?? [],
      };
      const inserted = await this.db.query<MsgRow>(
        `INSERT INTO vauto_transaction_messages (
           id, transaction_id, sender_id, message_type, event_type, text,
           payload_json, idempotency_key, created_at, chat_version
         ) VALUES ($1,$2,$3,'USER_MESSAGE',NULL,$4,$5::jsonb,$6,NOW(),'1.0')
         RETURNING *`,
        [
          id,
          input.transactionId,
          input.senderId,
          input.text,
          JSON.stringify(payload),
          input.idempotencyKey,
        ]
      );
      return { row: mapRow(inserted.rows[0]!), idempotentReplay: false };
    });
  }

  /**
   * Server-only domain event append (same DB connection / TX as caller when used from offers).
   * Does NOT open its own transaction when `inOuterTx` is true.
   */
  async appendDomainEvent(
    transactionId: string,
    event: DomainEventWrite,
    opts?: { inOuterTx?: boolean }
  ): Promise<TransactionMessageRow> {
    const run = async () => {
      const existing = await this.db.query<MsgRow>(
        `SELECT * FROM vauto_transaction_messages
         WHERE transaction_id = $1 AND sender_id IS NULL AND idempotency_key = $2
         LIMIT 1`,
        [transactionId, event.idempotencyKey]
      );
      if (existing.rows[0]) return mapRow(existing.rows[0]);

      const id = randomUUID();
      const inserted = await this.db.query<MsgRow>(
        `INSERT INTO vauto_transaction_messages (
           id, transaction_id, sender_id, message_type, event_type, text,
           payload_json, idempotency_key, created_at, chat_version
         ) VALUES ($1,$2,NULL,'DOMAIN_EVENT',$3,$4,$5::jsonb,$6,NOW(),'1.0')
         RETURNING *`,
        [
          id,
          transactionId,
          event.eventType,
          event.text,
          JSON.stringify(event.payload),
          event.idempotencyKey,
        ]
      );
      return mapRow(inserted.rows[0]!);
    };
    if (opts?.inOuterTx) return run();
    return this.withTx(run);
  }

  async listTimeline(input: {
    transactionId: string;
    userId: string;
    before?: string;
    limit: number;
  }): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
    const tx = await this.assertParticipant(input.transactionId, input.userId);
    void tx;
    const limit = Math.min(50, Math.max(1, input.limit));
    const cursor = input.before ? decodeCursor(input.before) : null;

    let rows: MsgRow[];
    if (cursor) {
      const res = await this.db.query<MsgRow>(
        `SELECT * FROM vauto_transaction_messages
         WHERE transaction_id = $1
           AND deleted_at IS NULL
           AND (created_at, id) < ($2::timestamptz, $3)
         ORDER BY created_at DESC, id DESC
         LIMIT $4`,
        [input.transactionId, cursor.createdAt, cursor.id, limit + 1]
      );
      rows = res.rows;
    } else {
      const res = await this.db.query<MsgRow>(
        `SELECT * FROM vauto_transaction_messages
         WHERE transaction_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [input.transactionId, limit + 1]
      );
      rows = res.rows;
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // Return chronological ascending for UI
    const chronological = [...page].reverse().map((r) => toTimelineItem(mapRow(r)));
    const oldest = page[page.length - 1];
    const nextCursor =
      hasMore && oldest
        ? encodeCursor(iso(oldest.created_at), oldest.id)
        : null;
    return { items: chronological, nextCursor };
  }

  async markRead(input: {
    transactionId: string;
    userId: string;
    lastReadMessageId: string;
  }): Promise<void> {
    await this.assertParticipant(input.transactionId, input.userId);
    const msg = await this.db.query<{ id: string }>(
      `SELECT id FROM vauto_transaction_messages
       WHERE id = $1 AND transaction_id = $2 AND deleted_at IS NULL`,
      [input.lastReadMessageId, input.transactionId]
    );
    if (!msg.rows[0]) {
      throw new ChatNotFoundError(input.transactionId);
    }
    await this.db.query(
      `INSERT INTO vauto_transaction_reads (
         transaction_id, user_id, last_read_message_id, last_read_at
       ) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (transaction_id, user_id) DO UPDATE SET
         last_read_message_id = EXCLUDED.last_read_message_id,
         last_read_at = NOW()`,
      [input.transactionId, input.userId, input.lastReadMessageId]
    );
  }

  async getReadCursor(
    transactionId: string,
    userId: string
  ): Promise<string | null> {
    const rows = await this.db.query<{ last_read_message_id: string | null }>(
      `SELECT last_read_message_id FROM vauto_transaction_reads
       WHERE transaction_id = $1 AND user_id = $2`,
      [transactionId, userId]
    );
    return rows.rows[0]?.last_read_message_id ?? null;
  }
}

/** Append domain event using an arbitrary TxQueryable (same TX as offers). */
export async function appendDomainEventOn(
  db: TxQueryable,
  transactionId: string,
  event: DomainEventWrite
): Promise<void> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM vauto_transaction_messages
     WHERE transaction_id = $1 AND sender_id IS NULL AND idempotency_key = $2
     LIMIT 1`,
    [transactionId, event.idempotencyKey]
  );
  if (existing.rows[0]) return;
  await db.query(
    `INSERT INTO vauto_transaction_messages (
       id, transaction_id, sender_id, message_type, event_type, text,
       payload_json, idempotency_key, created_at, chat_version
     ) VALUES ($1,$2,NULL,'DOMAIN_EVENT',$3,$4,$5::jsonb,$6,NOW(),'1.0')`,
    [
      randomUUID(),
      transactionId,
      event.eventType,
      event.text,
      JSON.stringify(event.payload),
      event.idempotencyKey,
    ]
  );
}
