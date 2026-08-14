/**
 * Stage 12A Playwright HTTP harness — PGlite + same Stage 11 routers.
 * Required for independent E2E reproduction (export this file with the 12A pack).
 * Not mounted in production index.ts.
 *
 * Simulated provider endpoints (harness-only):
 *   POST /api/test/simulate-payment-success  — signed Stripe webhook, not live Stripe
 *   POST /api/test/carrier-status            — FakeCarrierAdapter, not live Omniva OMX
 *
 * Real PostgreSQL 16 is used by CI (`TEST_DATABASE_URL`), not by this harness.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { PGlite } from "@electric-sql/pglite";
import { signAccessToken } from "../auth/tokens.js";
import { requireAuth, optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { setTxQueryableOverride, type TxQueryable } from "../transaction/index.js";
import { TRANSACTION_MIGRATION_SQL } from "../transaction/index.js";
import { OFFERS_MIGRATION_SQL } from "../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../deal-room/index.js";
import { PAYMENT_LEDGER_MIGRATION_SQL, PaymentRepository } from "../payment/index.js";
import {
  STRIPE_PI_MIGRATION_SQL,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
  createStripeWebhookProcessor,
  generateTestStripeSignatureHeader,
} from "../payments/stripe/index.js";
import {
  FUNDS_TRANSFER_MIGRATION_SQL,
  REFUND_PENDING_MIGRATION_SQL,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL,
  setSellerConnectOverride,
} from "../payments/transfer/index.js";
import {
  DELIVERY_MIGRATION_SQL,
  DELIVERY_HARDENING_MIGRATION_SQL,
  DURABLE_RELEASE_MIGRATION_SQL,
  STALE_RELEASE_RECOVERY_MIGRATION_SQL,
  FakeCarrierAdapter,
  setDeliveryCarrierOverride,
} from "../delivery/index.js";
import {
  DISPUTE_MIGRATION_SQL,
  DISPUTE_FINALITY_MIGRATION_SQL,
} from "../disputes/index.js";
import { REPUTATION_MIGRATION_SQL } from "../reputation/index.js";
import { offersRouter } from "../routes/offers.js";
import { dealRoomRouter } from "../routes/deal-room.js";
import { paymentIntentRouter } from "../routes/payment-intent.js";
import { fundsTransferRouter } from "../routes/funds-transfer.js";
import { deliveryRouter } from "../routes/delivery.js";
import { disputeRouter } from "../routes/disputes.js";
import { reputationRouter } from "../routes/reputation.js";
import { transactionsRouter } from "../routes/transactions.js";

export const STAGE12A_WHSEC = "whsec_stage12a_test_secret_key_0001";

const LISTINGS_STUB = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC(12,2),
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active'
);
`;

function adaptPglite(db: PGlite): TxQueryable {
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as never[]);
      return {
        rows: (res.rows ?? []) as never[],
        rowCount: res.affectedRows ?? null,
      };
    },
  };
}

async function applySql(db: PGlite, sql: string) {
  await db.exec(sql);
}

export async function startStage12aHarness(port = Number(process.env.PORT ?? 4011)) {
  delete process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = STAGE12A_WHSEC;
  process.env.STAGE12A_HARNESS = "1";
  process.env.JWT_SECRET =
    process.env.JWT_SECRET?.trim() || "vauto-dev-secret-change-in-production";

  const pglite = new PGlite();
  const q = adaptPglite(pglite);
  setTxQueryableOverride(q);

  await applySql(pglite, TRANSACTION_MIGRATION_SQL);
  await applySql(pglite, OFFERS_MIGRATION_SQL);
  await applySql(pglite, TRANSACTION_CHAT_MIGRATION_SQL);
  await applySql(pglite, DEAL_ROOM_MIGRATION_SQL);
  await applySql(pglite, PAYMENT_LEDGER_MIGRATION_SQL);
  await applySql(pglite, STRIPE_PI_MIGRATION_SQL);
  await applySql(pglite, STRIPE_WEBHOOKS_MIGRATION_SQL);
  await applySql(pglite, FUNDS_TRANSFER_MIGRATION_SQL);
  await applySql(pglite, REFUND_PENDING_MIGRATION_SQL);
  await applySql(pglite, IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL);
  await applySql(pglite, DELIVERY_MIGRATION_SQL);
  await applySql(pglite, DELIVERY_HARDENING_MIGRATION_SQL);
  await applySql(pglite, DURABLE_RELEASE_MIGRATION_SQL);
  await applySql(pglite, STALE_RELEASE_RECOVERY_MIGRATION_SQL);
  await applySql(pglite, DISPUTE_MIGRATION_SQL);
  await applySql(pglite, DISPUTE_FINALITY_MIGRATION_SQL);
  await applySql(pglite, REPUTATION_MIGRATION_SQL);
  await applySql(pglite, LISTINGS_STUB);

  const fakeCarrier = new FakeCarrierAdapter();
  setDeliveryCarrierOverride(fakeCarrier);
  setSellerConnectOverride({
    async getSellerStripeAccountId(sellerId: string) {
      const slug = sellerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "seller";
      return `acct_12a_${slug}`;
    },
  });

  const app = express();
  app.use(
    cors({
      origin: [
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
      ],
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(optionalAuth);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, harness: "stage12a", db: "pglite" });
  });

  app.post("/api/test/token", (req, res) => {
    const userId = String(req.body?.userId ?? "").trim();
    if (!userId) {
      res.status(400).json({ error: "userId_required" });
      return;
    }
    const token = signAccessToken({
      sub: userId,
      role: String(req.body?.role ?? "private"),
      provider: "phone",
    });
    res.json({ token, userId });
  });

  app.post("/api/test/seed-listing", async (req, res) => {
    try {
      const id = String(req.body?.id ?? `L-${randomUUID().slice(0, 8)}`);
      const sellerId = String(req.body?.sellerId ?? "seller-12a");
      const title = String(req.body?.title ?? "VAUTO 12A bandymas");
      const price = Number(req.body?.price ?? 1000);
      await q.query(
        `INSERT INTO listings (id, seller_id, title, price, image, attributes, status)
         VALUES ($1,$2,$3,$4,'https://img.example/12a.jpg','{}'::jsonb,'active')
         ON CONFLICT (id) DO UPDATE SET seller_id = EXCLUDED.seller_id, title = EXCLUDED.title, price = EXCLUDED.price`,
        [id, sellerId, title, price]
      );
      res.status(201).json({ id, sellerId, title, price });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "seed_failed" });
    }
  });

  app.post("/api/test/simulate-payment-success", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const transactionId = String(req.body?.transactionId ?? "").trim();
      const intent = await new PaymentRepository(q).getByTransactionId(transactionId);
      if (!intent?.stripePaymentIntentId) {
        res.status(404).json({ error: "not_found", message: "Payment intent not found" });
        return;
      }
      const event = {
        id: `evt_${randomUUID().replace(/-/g, "")}`,
        object: "event",
        api_version: "2024-11-20.acacia",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: intent.stripePaymentIntentId,
            object: "payment_intent",
            amount: intent.amountCents,
            currency: "eur",
            status: "succeeded",
            metadata: {},
          },
        },
      };
      const payload = JSON.stringify(event);
      const signature = generateTestStripeSignatureHeader({
        payload,
        secret: STAGE12A_WHSEC,
      });
      const processor = createStripeWebhookProcessor({
        db: q,
        webhookSecret: STAGE12A_WHSEC,
        requireLivemode: false,
      });
      const result = await processor.handleRawWebhook({
        rawBody: Buffer.from(payload, "utf8"),
        signatureHeader: signature,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({
        error: "simulate_failed",
        message: e instanceof Error ? e.message : "failed",
      });
    }
  });

  app.post("/api/test/carrier-status", requireAuth, async (req: AuthedRequest, res) => {
    const trackingCode = String(req.body?.trackingCode ?? "").trim();
    const status = String(req.body?.status ?? "IN_TRANSIT");
    if (!trackingCode) {
      res.status(400).json({ error: "trackingCode_required" });
      return;
    }
    if (status === "DELIVERED") {
      fakeCarrier.markDelivered(trackingCode);
    } else {
      fakeCarrier.setNextTrackingStatus(
        status === "CARRIER_ACCEPTED" ? "CARRIER_ACCEPTED" : "IN_TRANSIT"
      );
    }
    res.json({ ok: true, trackingCode, status });
  });

  app.get("/api/test/review-count", requireAuth, async (req: AuthedRequest, res) => {
    const transactionId = String(req.query.transactionId ?? "").trim();
    const rows = await q.query<{ n: number | string }>(
      `SELECT COUNT(*)::int AS n FROM vauto_reviews WHERE transaction_id = $1`,
      [transactionId]
    );
    res.json({ count: Number(rows.rows[0]?.n ?? 0) });
  });

  app.get("/api/auth/session", requireAuth, (req: AuthedRequest, res) => {
    const id = req.authUserId!;
    res.json({
      user: {
        id,
        name: id.startsWith("seller") ? "12A Pardavėjas" : "12A Pirkėjas",
        nickname: id,
        phone: "+37060000000",
        city: "",
        avatar:
          "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
        role: req.authRole ?? "private",
        profileType: "private",
      },
      role: req.authRole ?? "private",
    });
  });

  app.use("/api", transactionsRouter);
  app.use("/api", offersRouter);
  app.use("/api", dealRoomRouter);
  app.use("/api", paymentIntentRouter);
  app.use("/api", fundsTransferRouter);
  app.use("/api", deliveryRouter);
  app.use("/api", disputeRouter);
  app.use("/api", reputationRouter);

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const shutdown = async () => {
    server.close();
    setTxQueryableOverride(null);
    setDeliveryCarrierOverride(null);
    setSellerConnectOverride(null);
    await pglite.close();
  };

  return { app, server, port, shutdown, db: q };
}

const isDirectRun = process.argv[1]?.includes("stage12a-http-app");
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 4011);
  startStage12aHarness(port)
    .then(({ port: p }) => {
      console.log(`STAGE12A_HARNESS_READY port=${p}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
