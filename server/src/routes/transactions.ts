/**
 * Stage 12A — thin transaction HTTP (create / list / complete).
 * Buyer/seller IDs and status are never taken from the client.
 */

import { Router } from "express";
import { z, ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import {
  createPoolTxQueryable,
  createTransactionRepository,
  InvalidTransitionError,
  VersionConflictError,
  TRANSACTION_STATE_MACHINE_VERSION,
} from "../transaction/index.js";
import { PaymentRepository } from "../payment/index.js";

export const transactionsRouter = Router();

const IdempotencyBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((body, ctx) => {
    const forbidden = [
      "buyerId",
      "sellerId",
      "status",
      "buyer_id",
      "seller_id",
      "amount",
      "amountCents",
    ] as const;
    for (const k of forbidden) {
      if (k in (body as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `client_${k}_forbidden`,
        });
      }
    }
  });

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Neteisingi duomenys",
      stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    });
    return true;
  }
  if (e instanceof InvalidTransitionError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    });
    return true;
  }
  if (e instanceof VersionConflictError) {
    res.status(409).json({
      error: e.code,
      message: e.message,
      stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    });
    return true;
  }
  return false;
}

transactionsRouter.get(
  "/transactions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const repo = createTransactionRepository(createPoolTxQueryable());
      const items = await repo.listForActor(req.authUserId!);
      res.json({
        transactions: items.map((t) => ({
          id: t.id,
          listingId: t.listingId,
          buyerId: t.buyerId,
          sellerId: t.sellerId,
          status: t.status,
          currentPrice: t.currentPrice,
          currency: t.currency,
          version: t.version,
          updatedAt: t.updatedAt,
          viewerRole:
            t.buyerId === req.authUserId! ? ("BUYER" as const) : ("SELLER" as const),
        })),
        stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
      });
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

transactionsRouter.post(
  "/listings/:listingId/transactions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      IdempotencyBodySchema.parse(req.body ?? {});
      const listingId = String(req.params.listingId ?? "").trim();
      if (!listingId) {
        res.status(400).json({ error: "validation_error", message: "listing_required" });
        return;
      }
      const db = createPoolTxQueryable();
      const listing = await db.query<{
        id: string;
        seller_id: string;
        title: string | null;
        price: string | number | null;
        status: string | null;
      }>(
        `SELECT id, seller_id, title, price, status FROM listings WHERE id = $1 LIMIT 1`,
        [listingId]
      );
      const row = listing.rows[0];
      if (!row) {
        res.status(404).json({ error: "not_found", message: "Not found" });
        return;
      }
      const sellerId = String(row.seller_id ?? "").trim();
      const buyerId = req.authUserId!;
      if (!sellerId || sellerId === buyerId) {
        res.status(400).json({
          error: "validation_error",
          message: "Negalite pradėti sandorio su savimi",
        });
        return;
      }
      if (row.status && row.status !== "active") {
        res.status(409).json({
          error: "LISTING_NOT_ACTIVE",
          message: "Šis skelbimas nebėra aktyvus",
        });
        return;
      }

      const repo = createTransactionRepository(db);
      const open = await db.query<{ id: string }>(
        `SELECT id FROM vauto_transactions
         WHERE listing_id = $1 AND buyer_id = $2
           AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED')
         ORDER BY created_at DESC LIMIT 1`,
        [listingId, buyerId]
      );
      if (open.rows[0]) {
        const existing = await repo.getById(open.rows[0].id);
        res.status(200).json({
          transaction: existing,
          idempotentReplay: true,
          stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
        });
        return;
      }

      const priceNum =
        row.price == null ? null : Number(row.price);
      const tx = await repo.create({
        listingId,
        buyerId,
        sellerId,
        currentPrice:
          priceNum != null && Number.isFinite(priceNum) && priceNum >= 0
            ? priceNum
            : null,
        idempotencyKey: String(
          (req.body as { idempotencyKey?: string }).idempotencyKey
        ),
      });
      res.status(201).json({
        transaction: tx,
        idempotentReplay: false,
        stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
      });
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

transactionsRouter.post(
  "/transactions/:id/complete",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = IdempotencyBodySchema.parse(req.body ?? {});
      const db = createPoolTxQueryable();
      const repo = createTransactionRepository(db);
      const txn = await repo.getById(req.params.id);
      if (!txn) {
        res.status(404).json({ error: "not_found", message: "Not found" });
        return;
      }
      const isBuyer = txn.buyerId === req.authUserId;
      const isSeller = txn.sellerId === req.authUserId;
      if (!isBuyer && !isSeller) {
        res.status(404).json({ error: "not_found", message: "Not found" });
        return;
      }
      if (txn.status === "COMPLETED") {
        res.json({
          transaction: txn,
          idempotentReplay: true,
          stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
        });
        return;
      }
      if (txn.status !== "DELIVERED") {
        res.status(422).json({
          error: "INVALID_STATE",
          message: `Užbaigti galima tik po pristatymo patvirtinimo (dabar: ${txn.status})`,
          stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
        });
        return;
      }

      const intent = await new PaymentRepository(db).getByTransactionId(txn.id);
      const fundsSettled =
        intent?.transferStatus === "TRANSFERRED" ||
        intent?.status === "RELEASED_TO_SELLER";
      if (intent && !fundsSettled) {
        res.status(422).json({
          error: "FUNDS_NOT_SETTLED",
          message:
            "Sandoris užbaigiamas, kai lėšų pervedimas patvirtintas serveryje",
          stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
        });
        return;
      }

      const result = await repo.executeTransition({
        transactionId: txn.id,
        toStatus: "COMPLETED",
        actorType: isBuyer ? "BUYER" : "SELLER",
        actorId: req.authUserId!,
        reasonCode: "COMPLETION_CONFIRMED",
        expectedVersion: txn.version,
        idempotencyKey: `complete-${body.idempotencyKey}`,
        metadata: { source: "party_complete", stage: "12A" },
      });
      res.json({
        transaction: result.transaction,
        idempotentReplay: false,
        stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
      });
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
