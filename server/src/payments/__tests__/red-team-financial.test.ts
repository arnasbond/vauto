/**
 * Stage 11F.5 — Red-team financial stress suite (~150+).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { TransactionRepository, TxQueryable } from "../../transaction/index.js";
import type { OfferEngine } from "../../transaction/offers/index.js";
import { listLedgerForIntent, PaymentRepository } from "../../payment/index.js";
import {
  ReleaseToSellerBodySchema,
  RefundToBuyerBodySchema,
  FundsTransferForbiddenError,
} from "../transfer/index.js";
import {
  CreateStripeIntentBodySchema,
} from "../stripe/index.js";
import {
  reconcilePaymentIntent,
  checkAllInvariants,
  allInvariantsOk,
  loadReconcileSubject,
} from "../reconciliation/index.js";
import {
  bootFinancialDb,
  setupHeldDelivered,
  providerLookupFromFake,
  key,
} from "./financial-harness.js";
import {
  generateTestStripeSignatureHeader,
  createStripeWebhookProcessor,
} from "../stripe/webhooks/index.js";
import { TEST_WHSEC } from "./financial-harness.js";
import { randomUUID } from "node:crypto";

describe("11F.5 Red Team Financial Stress", () => {
  let close: () => Promise<void>;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;

  before(async () => {
    const boot = await bootFinancialDb();
    close = boot.close;
    q = boot.q;
    txRepo = boot.txRepo;
    offers = boot.offers;
  });

  after(async () => {
    await close?.();
  });

  // —— 35 transfer + refund race ——
  for (let i = 0; i < 35; i++) {
    it(`concurrent release vs refund deterministic #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `race-${i}`,
        85000 + i
      );
      const results = await Promise.allSettled([
        ctx.funds.releaseToSeller({
          transactionId: ctx.txId,
          actorUserId: ctx.buyerId,
          body: { idempotencyKey: key(`race-rel-${i}`) },
        }),
        ctx.funds.refundToBuyer({
          authority: "SYSTEM",
          transactionId: ctx.txId,
          actorUserId: ctx.buyerId,
          body: { idempotencyKey: key(`race-ref-${i}`) },
        }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      assert.ok(fulfilled.length >= 1);
      const intent = await new PaymentRepository(q).getByTransactionId(ctx.txId);
      const terminal =
        intent!.transferStatus === "TRANSFERRED" ||
        intent!.transferStatus === "REFUNDED" ||
        intent!.transferStatus === "REFUND_PENDING";
      assert.equal(terminal, true);
      // No double economic win
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      const transfers = ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED");
      const refunds = ledger.filter((e) => e.entryType === "BUYER_REFUNDED");
      assert.ok(transfers.length + refunds.length >= 1);
      if (intent!.transferStatus === "TRANSFERRED") {
        assert.equal(transfers.length, 1);
      }
      if (intent!.transferStatus === "REFUNDED" && transfers.length === 0) {
        assert.equal(refunds.length, 1);
      }
    });
  }

  // —— 30 multi-thread concurrency ——
  for (let i = 0; i < 10; i++) {
    it(`20 concurrent releases → 1 transfer #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `crel-${i}`,
        86000 + i
      );
      const out = await Promise.all(
        Array.from({ length: 20 }, (_, j) =>
          ctx.funds.releaseToSeller({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`crel-${i}-${j}`) },
          })
        )
      );
      const ids = new Set(out.map((r) => r.stripeTransferId));
      assert.equal(ids.size, 1);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`20 concurrent refunds → 1 refund #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `cref-${i}`,
        87000 + i
      );
      const out = await Promise.all(
        Array.from({ length: 20 }, (_, j) =>
          ctx.funds.refundToBuyer({
            authority: "SYSTEM",
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`cref-${i}-${j}`) },
          })
        )
      );
      const ids = new Set(out.map((r) => r.stripeRefundId).filter(Boolean));
      assert.equal(ids.size, 1);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "BUYER_REFUNDED").length,
        1
      );
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`20 duplicate succeeded webhooks → 1 hold #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `cwh-${i}`,
        88000 + i
      );
      // Already held — fire duplicate webhook event id again via new events same PI
      const event = {
        id: `evt_dup_${randomUUID().replace(/-/g, "")}`,
        object: "event",
        api_version: "2024-11-20.acacia",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: ctx.stripePaymentIntentId,
            object: "payment_intent",
            amount: ctx.offerCents,
            currency: "eur",
            status: "succeeded",
            metadata: {},
          },
        },
      };
      const payload = JSON.stringify(event);
      const signature = generateTestStripeSignatureHeader({
        payload,
        secret: TEST_WHSEC,
      });
      const proc = createStripeWebhookProcessor({
        db: q,
        webhookSecret: TEST_WHSEC,
        requireLivemode: false,
      });
      await Promise.all(
        Array.from({ length: 20 }, () =>
          proc.handleRawWebhook({
            rawBody: Buffer.from(payload, "utf8"),
            signatureHeader: signature,
          })
        )
      );
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "ESCROW_HOLD").length,
        1
      );
    });
  }

  // —— 25 client tampering ——
  const tampers = [
    { idempotencyKey: "abcdefgh", amountCents: 1 },
    { idempotencyKey: "abcdefgh", destinationAccountId: "acct_x" },
    { idempotencyKey: "abcdefgh", transferAmount: 9 },
    { idempotencyKey: "abcdefgh", platformFeeCents: 1 },
    { idempotencyKey: "abcdefgh", sellerNetCents: 1 },
    { idempotencyKey: "abcdefgh", currency: "USD" },
    { idempotencyKey: "abcdefgh", sellerId: "s" },
    { idempotencyKey: "abcdefgh", status: "PAID" },
    { idempotencyKey: "abcdefgh", amount: 1 },
    { idempotencyKey: "abcdefgh", sellerStripeAccountId: "acct_y" },
    {},
    { idempotencyKey: "short" },
    { destinationAccountId: "acct_z" },
    { idempotencyKey: "abcdefghij", platformFee: 5 },
    { idempotencyKey: "abcdefghij", sellerNet: 95 },
    { idempotencyKey: "abcdefghij", stripeTransferId: "tr_x" },
    { idempotencyKey: "abcdefghij", clientSecret: "sec" },
    { idempotencyKey: "abcdefghij", snapshotId: "snap" },
    { idempotencyKey: "abcdefghij", dealSnapshotId: "d" },
    { idempotencyKey: "abcdefghij", transactionId: "t" },
    { idempotencyKey: "abcdefghij", buyerId: "b" },
    { idempotencyKey: "abcdefghij", amount_cents: 2 },
    { idempotencyKey: "abcdefghij", transfer_status: "TRANSFERRED" },
    { idempotencyKey: "abcdefghij", stripePaymentIntentId: "pi_x" },
    { amountCents: 1, idempotencyKey: "abcdefghij" },
  ];
  for (let i = 0; i < 25; i++) {
    it(`client tampering rejected #${i}`, () => {
      assert.throws(() => ReleaseToSellerBodySchema.parse(tampers[i]));
      assert.throws(() => RefundToBuyerBodySchema.parse(tampers[i]));
      assert.throws(() => CreateStripeIntentBodySchema.parse(tampers[i]));
    });
  }

  // —— 20 provider / dashboard tampering ——
  for (let i = 0; i < 20; i++) {
    it(`dashboard amount change flagged #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `dash-${i}`,
        89000 + i
      );
      ctx.fake.tamperPaymentIntentAmount(
        ctx.stripePaymentIntentId,
        ctx.offerCents - 1
      );
      const { findings, inSync } = await reconcilePaymentIntent(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.equal(inSync, false);
      assert.ok(findings.some((f) => f.classification === "SECURITY_MISMATCH"));
    });
  }

  // —— 15 IDOR / auth isolation ——
  for (let i = 0; i < 15; i++) {
    it(`stranger cannot release; buyer self-refund forbidden #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `idor-${i}`,
        90000 + i
      );
      await assert.rejects(() =>
        ctx.funds.releaseToSeller({
          transactionId: ctx.txId,
          actorUserId: `stranger-${i}`,
          body: { idempotencyKey: key(`idor-r-${i}`) },
        })
      );
      await assert.rejects(
        () =>
          ctx.funds.refundToBuyer({
            // C-02: missing/invalid authority → 403 (buyer cannot self-refund)
            authority: "BUYER" as unknown as "SYSTEM",
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`idor-f-${i}`) },
          }),
        (e: unknown) => e instanceof FundsTransferForbiddenError
      );
    });
  }

  // —— 15 privacy / alert ——
  for (let i = 0; i < 15; i++) {
    it(`no raw secrets in reconcile findings #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `nsec-${i}`,
        91000 + i
      );
      const { findings } = await reconcilePaymentIntent(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.doesNotMatch(JSON.stringify(findings), /sk_|whsec_|client_secret/);
    });
  }

  // —— post-transfer refund invariants ——
  for (let i = 0; i < 10; i++) {
    it(`post-transfer refund records reversal #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `ptr-${i}`,
        92000 + i
      );
      await ctx.funds.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`ptr-rel-${i}`) },
      });
      await ctx.funds.refundToBuyer({
        authority: "SYSTEM",
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`ptr-ref-${i}`) },
      });
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.ok(ledger.some((e) => e.entryType === "TRANSFER_REVERSED"));
      assert.ok(ledger.some((e) => e.entryType === "BUYER_REFUNDED"));
      const subject = await loadReconcileSubject(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.ok(allInvariantsOk(checkAllInvariants(subject!)));
    });
  }

  // —— crash mid-release recovery ——
  for (let i = 0; i < 10; i++) {
    it(`crash window release recovery #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `crw-${i}`,
        93000 + i
      );
      await ctx.funds.tx1OnlyPrepareTransferForTests({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        clientIdempotencyKey: key(`crw-c-${i}`),
      });
      const again = await ctx.funds.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`crw-fin-${i}`) },
      });
      assert.equal(again.transferStatus, "TRANSFERRED");
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
    });
  }
});
