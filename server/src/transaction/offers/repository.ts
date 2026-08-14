/**
 * Structured Offers 1.0 — PostgreSQL repository with atomic TX + 11A integration.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransactionRepository,
  type TxQueryable,
} from "../repository.js";
import { runQueryableTransaction } from "../tx-connection.js";
import {
  ListingSaleConflictError,
  OfferIdempotencyConflictError,
  OfferNotFoundError,
  OfferStateError,
  OfferVersionConflictError,
  type OfferStatus,
  type VautoOffer,
} from "./types.js";
import {
  assertBuyerCanCreateInitialOffer,
  assertCanWithdraw,
  assertCounterpartyAction,
  assertNotExpired,
  assertOfferPending,
  assertParticipant,
  resolveActorRole,
} from "./offer-validator.js";
import {
  CounterOfferBodySchema,
  CreateOfferBodySchema,
  OfferActionBodySchema,
} from "./schema.js";
import { STRUCTURED_OFFERS_VERSION } from "./version.js";
import type { VautoTransaction } from "../types.js";
import {
  InvalidTransitionError,
  VersionConflictError,
} from "../types.js";
import { appendDomainEventOn } from "../../transaction-chat/repository.js";
import {
  offerAcceptedEvent,
  offerCounteredEvent,
  offerCreatedEvent,
  offerExpiredEvent,
  offerRejectedEvent,
  offerWithdrawnEvent,
  transactionStateChangedEvent,
} from "../../transaction-chat/event-adapter.js";
import { ensureAgreementSnapshot } from "../../deal-room/snapshot-writer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const OFFERS_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/040_structured_offers_1.0.sql"
  ),
  "utf8"
);

export const OFFERS_MIGRATION_ID = "040_structured_offers_1.0";

type OfferRow = {
  id: string;
  transaction_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_by_user_id: string;
  parent_offer_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  version: number;
  idempotency_key: string;
  expires_at: Date | string | null;
  offers_version: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapOffer(r: OfferRow): VautoOffer {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    listingId: r.listing_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    createdByUserId: r.created_by_user_id,
    parentOfferId: r.parent_offer_id,
    amountCents: Number(r.amount_cents),
    currency: "EUR",
    status: r.status as OfferStatus,
    version: Number(r.version),
    idempotencyKey: r.idempotency_key,
    expiresAt: r.expires_at == null ? null : iso(r.expires_at),
    offersVersion: STRUCTURED_OFFERS_VERSION,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export type OfferMutationResult = {
  offer: VautoOffer;
  transaction: VautoTransaction;
  idempotentReplay: boolean;
};

const SALE_STATUSES = [
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;

export class OfferRepository {
  private readonly rootDb: TxQueryable;
  /** Active queryable — swapped to PoolClient-bound TX during withTx. */
  private db: TxQueryable;
  private txRepo: TransactionRepository;
  /** Serialize TX on single-connection adapters (PGlite). */
  private txChain: Promise<unknown> = Promise.resolve();

  constructor(db: TxQueryable) {
    this.rootDb = db;
    this.db = db;
    this.txRepo = new TransactionRepository(db);
  }

  /**
   * Single-connection atomic TX via runQueryableTransaction (PoolClient in prod).
   */
  private async withTx<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.txChain;
    this.txChain = prev.then(() => gate);
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

  async getOffer(id: string): Promise<VautoOffer | null> {
    const rows = await this.db.query<OfferRow>(
      `SELECT * FROM vauto_offers WHERE id = $1`,
      [id]
    );
    return rows.rows[0] ? mapOffer(rows.rows[0]) : null;
  }

  async listOffersForTransaction(
    transactionId: string,
    userId: string
  ): Promise<VautoOffer[]> {
    const tx = await this.txRepo.getById(transactionId);
    if (!tx) throw new OfferNotFoundError(transactionId);
    resolveActorRole(userId, tx);
    const rows = await this.db.query<OfferRow>(
      `SELECT * FROM vauto_offers
       WHERE transaction_id = $1
       ORDER BY created_at ASC`,
      [transactionId]
    );
    return rows.rows.map(mapOffer);
  }

  private async lockOffer(id: string): Promise<VautoOffer> {
    const rows = await this.db.query<OfferRow>(
      `SELECT * FROM vauto_offers WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows.rows[0]) throw new OfferNotFoundError(id);
    return mapOffer(rows.rows[0]);
  }

  private async lockTransaction(id: string): Promise<VautoTransaction> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM vauto_transactions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows.rows[0]) {
      throw new OfferStateError(`Transaction not found: ${id}`);
    }
    const tx = await this.txRepo.getById(id);
    if (!tx) throw new OfferStateError(`Transaction not found: ${id}`);
    return tx;
  }

  private async assertListingAvailable(listingId: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM vauto_transactions
       WHERE listing_id = $1 AND status = ANY($2::text[])
       FOR UPDATE`,
      [listingId, [...SALE_STATUSES]]
    );
    if (rows.rows[0]) {
      throw new ListingSaleConflictError(listingId);
    }
  }

  private async findByIdempotency(
    transactionId: string,
    idempotencyKey: string
  ): Promise<VautoOffer | null> {
    const rows = await this.db.query<OfferRow>(
      `SELECT * FROM vauto_offers
       WHERE transaction_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [transactionId, idempotencyKey]
    );
    return rows.rows[0] ? mapOffer(rows.rows[0]) : null;
  }

  private async transitionSm(input: {
    transactionId: string;
    expectedVersion: number;
    toStatus: VautoTransaction["status"];
    actorType: "BUYER" | "SELLER" | "SYSTEM" | "ADMIN";
    actorId: string;
    idempotencyKey: string;
    reasonCode:
      | "OFFER_SUBMITTED"
      | "COUNTER_OFFER"
      | "OFFER_ACCEPTED"
      | "BUYER_CANCELLED"
      | "SELLER_CANCELLED"
      | "TIMEOUT_EXPIRED"
      | "SYSTEM_TRANSITION"
      | "MUTUAL_AGREEMENT";
  }): Promise<VautoTransaction> {
    const res = await this.txRepo.executeTransitionInTx(this.db, {
      transactionId: input.transactionId,
      expectedVersion: input.expectedVersion,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reasonCode: input.reasonCode,
    });
    return res.transaction;
  }

  private async emitDomain(
    transactionId: string,
    event: Parameters<typeof appendDomainEventOn>[2],
    prevStatus: string | undefined,
    nextTx: VautoTransaction
  ): Promise<void> {
    await appendDomainEventOn(this.db, transactionId, event);
    if (prevStatus && prevStatus !== nextTx.status) {
      await appendDomainEventOn(
        this.db,
        transactionId,
        transactionStateChangedEvent(nextTx, prevStatus, event.eventType)
      );
    }
  }

  /**
   * Create initial / follow-up PENDING offer tip.
   * First offer on DISCUSSION → OFFER_PENDING.
   */
  async createOffer(input: {
    transactionId: string;
    actorUserId: string;
    amountCents: number;
    currency?: "EUR";
    expiresAt?: string | null;
    idempotencyKey: string;
  }): Promise<OfferMutationResult> {
    const body = CreateOfferBodySchema.parse({
      amountCents: input.amountCents,
      currency: input.currency ?? "EUR",
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
    });

    return this.withTx(async () => {
      const existing = await this.findByIdempotency(
        input.transactionId,
        body.idempotencyKey
      );
      if (existing) {
        const tx = await this.txRepo.getById(input.transactionId);
        if (!tx) throw new OfferStateError("Transaction missing");
        return { offer: existing, transaction: tx, idempotentReplay: true };
      }

      const tx = await this.lockTransaction(input.transactionId);
      const role = resolveActorRole(input.actorUserId, tx);
      assertBuyerCanCreateInitialOffer(role, tx.status);
      await this.assertListingAvailable(tx.listingId);

      if (
        tx.status !== "DISCUSSION" &&
        tx.status !== "OFFER_PENDING" &&
        tx.status !== "NEGOTIATING"
      ) {
        throw new OfferStateError(
          `Cannot create offer in transaction status ${tx.status}`
        );
      }

      // Supersede prior PENDING tip on this tx (immutable chain tip).
      await this.db.query(
        `UPDATE vauto_offers
         SET status = 'COUNTERED', version = version + 1, updated_at = NOW()
         WHERE transaction_id = $1 AND status = 'PENDING'`,
        [tx.id]
      );

      const id = randomUUID();
      const inserted = await this.db.query<OfferRow>(
        `INSERT INTO vauto_offers (
           id, transaction_id, listing_id, buyer_id, seller_id, created_by_user_id,
           parent_offer_id, amount_cents, currency, status, version, idempotency_key,
           expires_at, offers_version, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,'EUR','PENDING',0,$8,$9,'1.0',NOW(),NOW())
         RETURNING *`,
        [
          id,
          tx.id,
          tx.listingId,
          tx.buyerId,
          tx.sellerId,
          input.actorUserId,
          body.amountCents,
          body.idempotencyKey,
          body.expiresAt ?? null,
        ]
      );
      const offer = mapOffer(inserted.rows[0]!);

      let nextTx = tx;
      if (tx.status === "DISCUSSION") {
        nextTx = await this.transitionSm({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "OFFER_PENDING",
          actorType: role,
          actorId: input.actorUserId,
          idempotencyKey: `sm-create-${body.idempotencyKey}`,
          reasonCode: "OFFER_SUBMITTED",
        });
      } else if (tx.status === "OFFER_PENDING") {
        // Subsequent create on same tx moves to NEGOTIATING
        nextTx = await this.transitionSm({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "NEGOTIATING",
          actorType: role,
          actorId: input.actorUserId,
          idempotencyKey: `sm-create-${body.idempotencyKey}`,
          reasonCode: "COUNTER_OFFER",
        });
      }

      await this.emitDomain(
        tx.id,
        offerCreatedEvent(offer, nextTx),
        tx.status,
        nextTx
      );
      return { offer, transaction: nextTx, idempotentReplay: false };
    });
  }

  async counterOffer(input: {
    offerId: string;
    actorUserId: string;
    amountCents: number;
    currency?: "EUR";
    expiresAt?: string | null;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<OfferMutationResult> {
    const body = CounterOfferBodySchema.parse({
      amountCents: input.amountCents,
      currency: input.currency ?? "EUR",
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });

    return this.withTx(async () => {
      const parent = await this.lockOffer(input.offerId);
      const prior = await this.findByIdempotency(
        parent.transactionId,
        body.idempotencyKey
      );
      if (prior) {
        const tx = await this.txRepo.getById(parent.transactionId);
        if (!tx) throw new OfferStateError("Transaction missing");
        return { offer: prior, transaction: tx, idempotentReplay: true };
      }

      assertParticipant(input.actorUserId, parent);
      assertOfferPending(parent);
      assertNotExpired(parent);
      if (parent.version !== body.expectedVersion) {
        throw new OfferVersionConflictError(parent.id, body.expectedVersion);
      }

      const tx = await this.lockTransaction(parent.transactionId);
      await this.assertListingAvailable(tx.listingId);
      const role = resolveActorRole(input.actorUserId, tx);

      const upd = await this.db.query<OfferRow>(
        `UPDATE vauto_offers
         SET status = 'COUNTERED', version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2 AND status = 'PENDING'
         RETURNING *`,
        [parent.id, body.expectedVersion]
      );
      if (!upd.rows[0]) {
        throw new OfferVersionConflictError(parent.id, body.expectedVersion);
      }

      const id = randomUUID();
      const inserted = await this.db.query<OfferRow>(
        `INSERT INTO vauto_offers (
           id, transaction_id, listing_id, buyer_id, seller_id, created_by_user_id,
           parent_offer_id, amount_cents, currency, status, version, idempotency_key,
           expires_at, offers_version, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EUR','PENDING',0,$9,$10,'1.0',NOW(),NOW())
         RETURNING *`,
        [
          id,
          parent.transactionId,
          parent.listingId,
          parent.buyerId,
          parent.sellerId,
          input.actorUserId,
          parent.id,
          body.amountCents,
          body.idempotencyKey,
          body.expiresAt ?? null,
        ]
      );
      const offer = mapOffer(inserted.rows[0]!);

      let nextTx = tx;
      if (tx.status === "OFFER_PENDING" || tx.status === "DISCUSSION") {
        nextTx = await this.transitionSm({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "NEGOTIATING",
          actorType: role,
          actorId: input.actorUserId,
          idempotencyKey: `sm-counter-${body.idempotencyKey}`,
          reasonCode: "COUNTER_OFFER",
        });
      } else if (tx.status !== "NEGOTIATING") {
        throw new OfferStateError(
          `Cannot counter in transaction status ${tx.status}`
        );
      }

      await this.emitDomain(
        tx.id,
        offerCounteredEvent(offer, parent.id, nextTx),
        tx.status,
        nextTx
      );
      return { offer, transaction: nextTx, idempotentReplay: false };
    });
  }

  async acceptOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<OfferMutationResult> {
    const body = OfferActionBodySchema.parse({
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });

    return this.withTx(async () => {
      const offer = await this.lockOffer(input.offerId);

      // Idempotent accept: already ACCEPTED with same key stored on offer? 
      // Use a side table via events — check if offer already ACCEPTED and key matches action meta.
      if (offer.status === "ACCEPTED") {
        const tx = await this.txRepo.getById(offer.transactionId);
        if (!tx) throw new OfferStateError("Transaction missing");
        // Replay if same idempotency was used (stored in SM events)
        const ev = await this.db.query<{ id: string }>(
          `SELECT id FROM vauto_transaction_events
           WHERE transaction_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [offer.transactionId, `sm-accept-${body.idempotencyKey}`]
        );
        if (ev.rows[0]) {
          return { offer, transaction: tx, idempotentReplay: true };
        }
        throw new OfferIdempotencyConflictError(body.idempotencyKey);
      }

      assertCounterpartyAction(input.actorUserId, offer, "accept");
      assertOfferPending(offer);
      assertNotExpired(offer);
      if (offer.version !== body.expectedVersion) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }

      const tx = await this.lockTransaction(offer.transactionId);
      await this.assertListingAvailable(tx.listingId);
      const role = resolveActorRole(input.actorUserId, tx);

      const upd = await this.db.query<OfferRow>(
        `UPDATE vauto_offers
         SET status = 'ACCEPTED', version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2 AND status = 'PENDING'
         RETURNING *`,
        [offer.id, body.expectedVersion]
      );
      if (!upd.rows[0]) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }

      // Invalidate other PENDING tips on same listing (other buyers).
      await this.db.query(
        `UPDATE vauto_offers
         SET status = 'REJECTED', version = version + 1, updated_at = NOW()
         WHERE listing_id = $1 AND status = 'PENDING' AND id <> $2`,
        [offer.listingId, offer.id]
      );

      // Drive SM to AGREED (OFFER_PENDING|NEGOTIATING → AGREED; rare DISCUSSION hop)
      let nextTx = tx;
      try {
        if (nextTx.status === "DISCUSSION") {
          nextTx = await this.transitionSm({
            transactionId: tx.id,
            expectedVersion: nextTx.version,
            toStatus: "OFFER_PENDING",
            actorType: role,
            actorId: input.actorUserId,
            idempotencyKey: `sm-accept-hop1-${body.idempotencyKey}`,
            reasonCode: "OFFER_SUBMITTED",
          });
        }
        if (
          nextTx.status === "OFFER_PENDING" ||
          nextTx.status === "NEGOTIATING"
        ) {
          nextTx = await this.transitionSm({
            transactionId: tx.id,
            expectedVersion: nextTx.version,
            toStatus: "AGREED",
            actorType: role,
            actorId: input.actorUserId,
            idempotencyKey: `sm-accept-${body.idempotencyKey}`,
            reasonCode: "OFFER_ACCEPTED",
          });
        } else if (nextTx.status !== "AGREED") {
          throw new OfferStateError(
            `Cannot accept into AGREED from ${nextTx.status}`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          e instanceof VersionConflictError ||
          /uq_vauto_transactions_listing_active_sale|duplicate key|unique/i.test(
            msg
          )
        ) {
          throw new ListingSaleConflictError(offer.listingId);
        }
        throw e;
      }

      // Sync agreed price onto transaction (cents → euro display field as integer euros? 
      // Spec: store cents on offers; current_price on tx is NUMERIC — store euros as amountCents/100)
      await this.db.query(
        `UPDATE vauto_transactions
         SET current_price = ($1::numeric / 100.0), updated_at = NOW()
         WHERE id = $2`,
        [offer.amountCents, offer.transactionId]
      );
      const refreshed = await this.txRepo.getById(offer.transactionId);
      const acceptedOffer = mapOffer(upd.rows[0]!);
      if (refreshed?.status === "AGREED") {
        await ensureAgreementSnapshot(this.db, {
          transaction: refreshed,
          acceptedOffer,
        });
      }
      await this.emitDomain(
        offer.transactionId,
        offerAcceptedEvent(acceptedOffer, refreshed!),
        tx.status,
        refreshed!
      );
      return {
        offer: acceptedOffer,
        transaction: refreshed!,
        idempotentReplay: false,
      };
    });
  }

  async rejectOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<OfferMutationResult> {
    const body = OfferActionBodySchema.parse({
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
    return this.withTx(async () => {
      const offer = await this.lockOffer(input.offerId);
      if (offer.status === "REJECTED") {
        const tx = await this.txRepo.getById(offer.transactionId);
        return {
          offer,
          transaction: tx!,
          idempotentReplay: true,
        };
      }
      assertCounterpartyAction(input.actorUserId, offer, "reject");
      assertOfferPending(offer);
      if (offer.version !== body.expectedVersion) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }
      const tx = await this.lockTransaction(offer.transactionId);
      const role = resolveActorRole(input.actorUserId, tx);

      const upd = await this.db.query<OfferRow>(
        `UPDATE vauto_offers
         SET status = 'REJECTED', version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2 AND status = 'PENDING'
         RETURNING *`,
        [offer.id, body.expectedVersion]
      );
      if (!upd.rows[0]) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }

      let nextTx = tx;
      if (tx.status === "OFFER_PENDING" || tx.status === "NEGOTIATING") {
        // Stay in NEGOTIATING if chain continues; move to NEGOTIATING from OFFER_PENDING
        if (tx.status === "OFFER_PENDING") {
          nextTx = await this.transitionSm({
            transactionId: tx.id,
            expectedVersion: tx.version,
            toStatus: "NEGOTIATING",
            actorType: role,
            actorId: input.actorUserId,
            idempotencyKey: `sm-reject-${body.idempotencyKey}`,
            reasonCode: "COUNTER_OFFER",
          });
        }
      }

      const rejected = mapOffer(upd.rows[0]!);
      await this.emitDomain(
        tx.id,
        offerRejectedEvent(rejected, nextTx),
        tx.status,
        nextTx
      );
      return {
        offer: rejected,
        transaction: nextTx,
        idempotentReplay: false,
      };
    });
  }

  async withdrawOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<OfferMutationResult> {
    const body = OfferActionBodySchema.parse({
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
    return this.withTx(async () => {
      const offer = await this.lockOffer(input.offerId);
      if (offer.status === "WITHDRAWN") {
        const tx = await this.txRepo.getById(offer.transactionId);
        return { offer, transaction: tx!, idempotentReplay: true };
      }
      assertCanWithdraw(input.actorUserId, offer);
      assertOfferPending(offer);
      if (offer.version !== body.expectedVersion) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }
      const tx = await this.lockTransaction(offer.transactionId);
      const role = resolveActorRole(input.actorUserId, tx);

      const upd = await this.db.query<OfferRow>(
        `UPDATE vauto_offers
         SET status = 'WITHDRAWN', version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2 AND status = 'PENDING'
         RETURNING *`,
        [offer.id, body.expectedVersion]
      );
      if (!upd.rows[0]) {
        throw new OfferVersionConflictError(offer.id, body.expectedVersion);
      }

      let nextTx = tx;
      // If no remaining PENDING offers, cancel negotiation
      const pending = await this.db.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_offers
         WHERE transaction_id = $1 AND status = 'PENDING'`,
        [tx.id]
      );
      if (
        Number(pending.rows[0]?.c ?? 0) === 0 &&
        (tx.status === "OFFER_PENDING" || tx.status === "NEGOTIATING")
      ) {
        nextTx = await this.transitionSm({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "CANCELLED",
          actorType: role,
          actorId: input.actorUserId,
          idempotencyKey: `sm-withdraw-${body.idempotencyKey}`,
          reasonCode:
            role === "BUYER" ? "BUYER_CANCELLED" : "SELLER_CANCELLED",
        });
      }

      const withdrawn = mapOffer(upd.rows[0]!);
      await this.emitDomain(
        tx.id,
        offerWithdrawnEvent(withdrawn, nextTx),
        tx.status,
        nextTx
      );
      return {
        offer: withdrawn,
        transaction: nextTx,
        idempotentReplay: false,
      };
    });
  }

  async expireOffer(input: {
    offerId: string;
    idempotencyKey: string;
  }): Promise<OfferMutationResult> {
    return this.withTx(async () => {
      const offer = await this.lockOffer(input.offerId);
      if (offer.status === "EXPIRED") {
        const tx = await this.txRepo.getById(offer.transactionId);
        return { offer, transaction: tx!, idempotentReplay: true };
      }
      assertOfferPending(offer);
      const tx = await this.lockTransaction(offer.transactionId);

      const upd = await this.db.query<OfferRow>(
        `UPDATE vauto_offers
         SET status = 'EXPIRED', version = version + 1, updated_at = NOW()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING *`,
        [offer.id]
      );
      if (!upd.rows[0]) throw new OfferStateError("Expire race lost");

      let nextTx = tx;
      if (tx.status === "OFFER_PENDING" || tx.status === "NEGOTIATING") {
        nextTx = await this.transitionSm({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "EXPIRED",
          actorType: "SYSTEM",
          actorId: "system",
          idempotencyKey: `sm-expire-${input.idempotencyKey}`,
          reasonCode: "TIMEOUT_EXPIRED",
        });
      }

      const expired = mapOffer(upd.rows[0]!);
      await this.emitDomain(
        tx.id,
        offerExpiredEvent(expired, nextTx),
        tx.status,
        nextTx
      );
      return {
        offer: expired,
        transaction: nextTx,
        idempotentReplay: false,
      };
    });
  }
}

export function createOfferRepository(db: TxQueryable): OfferRepository {
  return new OfferRepository(db);
}

// Re-export errors used by HTTP layer
export {
  InvalidTransitionError,
  VersionConflictError,
};
