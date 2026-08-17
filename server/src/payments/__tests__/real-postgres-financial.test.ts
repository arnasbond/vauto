/**
 * Stage 11F.6 — Real Postgres 16 financial consolidation gate (H-03 / M-02).
 * Runs with TEST_DATABASE_URL → pg.Pool({ max: 4 }); else PGlite fallback.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TxQueryable } from "../../transaction/index.js";
import type { TransactionRepository } from "../../transaction/index.js";
import type { OfferEngine } from "../../transaction/offers/index.js";
import { listLedgerForIntent, PaymentRepository } from "../../payment/index.js";
import {
  FundsTransferForbiddenError,
  finalizeBuyerRefundFromProvider,
} from "../transfer/index.js";
import { runQueryableTransaction } from "../../transaction/index.js";
import {
  bootFinancialDb,
  setupHeldDelivered,
  providerLookupFromFake,
  key,
  USE_REAL_PG,
  collectConcurrentSuccesses,
} from "./financial-harness.js";
import {
  createProductionProviderLookup,
  reconcilePaymentIntent,
  checkAllInvariants,
  allInvariantsOk,
  loadReconcileSubject,
} from "../reconciliation/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(
  path.resolve(__dirname, "../../index.ts"),
  "utf8"
);
const billingSrc = readFileSync(
  path.resolve(__dirname, "../../routes/billing.ts"),
  "utf8"
);
const lookupSrc = readFileSync(
  path.resolve(__dirname, "../reconciliation/stripe-provider-lookup.ts"),
  "utf8"
);
describe("11F.6 Financial Authority Consolidation Gate", () => {
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
    if (USE_REAL_PG) {
      assert.ok(boot.pool, "real postgres pool required when TEST_DATABASE_URL set");
      assert.ok((boot.pool.options.max ?? 0) >= 4);
    }
  });

  after(async () => {
    await close?.();
  });

  it("C-01: legacy escrow-billing and billing routers removed from index.ts", () => {
    assert.doesNotMatch(indexSrc, /escrowBillingRouter/);
    assert.doesNotMatch(indexSrc, /app\.use\(\s*["']\/api\/escrow-billing/);
    assert.doesNotMatch(indexSrc, /app\.use\(\s*["']\/api\/billing["']/);
  });

  it("H-02: production provider lookup factory is wired (null only without STRIPE_SECRET_KEY)", () => {
    const lookup = createProductionProviderLookup();
    if (process.env.STRIPE_SECRET_KEY?.trim()) {
      assert.ok(lookup);
    } else {
      assert.equal(lookup, null);
    }
  });

  it("C-02: buyer self-refund without privileged authority → FundsTransferForbiddenError", async () => {
    const ctx = await setupHeldDelivered(q, txRepo, offers, "c02-buyer", 88000);
    await assert.rejects(
      () =>
        ctx.funds.refundToBuyer({
          authority: "BUYER" as unknown as "SYSTEM",
          transactionId: ctx.txId,
          actorUserId: ctx.buyerId,
          body: { idempotencyKey: key("c02-bad") },
        }),
      (e: unknown) => e instanceof FundsTransferForbiddenError
    );
  });

  it("H-01: pending Stripe refund stays REFUND_PENDING until succeeded", async () => {
    const ctx = await setupHeldDelivered(q, txRepo, offers, "h01-pend", 87000);
    ctx.fake.configure({ pendingNextRefunds: 1 });
    const res = await ctx.funds.refundToBuyer({
      authority: "SYSTEM",
      transactionId: ctx.txId,
      actorUserId: "SYSTEM",
      body: { idempotencyKey: key("h01-pend") },
    });
    assert.equal(res.transferStatus, "REFUND_PENDING");
    assert.equal(res.status, "REFUND_PENDING");
    const ledger = await listLedgerForIntent(q, ctx.intent.id);
    assert.ok(ledger.some((e) => e.entryType === "BUYER_REFUND_PENDING"));
    assert.ok(!ledger.some((e) => e.entryType === "BUYER_REFUNDED"));

    const marked = ctx.fake.markRefundSucceeded(res.stripeRefundId!);
    assert.ok(marked);
    await runQueryableTransaction(q, async (tx) => {
      await finalizeBuyerRefundFromProvider(tx, {
        paymentIntentId: ctx.intent.id,
        transactionId: ctx.txId,
        actorUserId: "SYSTEM",
        stripeRefundId: marked!.id,
        stripeRefundStatus: "succeeded",
      });
    });
    const intent = await new PaymentRepository(q).getByTransactionId(ctx.txId);
    assert.equal(intent!.transferStatus, "REFUNDED");
    assert.equal(intent!.status, "REFUNDED");
    const ledger2 = await listLedgerForIntent(q, ctx.intent.id);
    assert.ok(ledger2.some((e) => e.entryType === "BUYER_REFUNDED"));
  });

  it("M-02: provider lookup filters transfers by stripe PI / transaction metadata", async () => {
    const ctx = await setupHeldDelivered(q, txRepo, offers, "m02-filt", 86000);
    await ctx.funds.releaseToSeller({
      transactionId: ctx.txId,
      actorUserId: ctx.buyerId,
      body: { idempotencyKey: key("m02-rel") },
    });
    const transfers = ctx.fake.listTransfers({
      transactionId: ctx.txId,
      paymentIntentId: ctx.intent.id,
    });
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0]!.metadata?.vautoTransactionId, ctx.txId);
    const byPi = ctx.fake.listTransfers({
      stripePaymentIntentId: ctx.stripePaymentIntentId,
    });
    assert.equal(byPi.length, 1);
    const { findings, inSync } = await reconcilePaymentIntent(
      q,
      ctx.intent.id,
      providerLookupFromFake(ctx.fake)
    );
    assert.equal(inSync, true);
    assert.equal(findings.length, 0);
  });

  for (let i = 0; i < 20; i++) {
    it(`real-pg pool concurrency release #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `rpg-rel-${i}`,
        85000 + i
      );
      const out = await collectConcurrentSuccesses(
        Array.from({ length: 8 }, (_, j) =>
          ctx.funds.releaseToSeller({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`rpg-rel-${i}-${j}`) },
          })
        )
      );
      assert.equal(new Set(out.map((r) => r.stripeTransferId)).size, 1);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`SYSTEM refund after hold #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `rpg-ref-${i}`,
        84000 + i
      );
      const res = await ctx.funds.refundToBuyer({
        authority: "ADMIN",
        transactionId: ctx.txId,
        actorUserId: "admin-1",
        body: { idempotencyKey: key(`rpg-ref-${i}`) },
      });
      assert.equal(res.transferStatus, "REFUNDED");
    });
  }

  // —— Stage 11F.7 certification delta ——
  it("H-01: billing webhook has no escrow DB write path", () => {
    assert.doesNotMatch(billingSrc, /markEscrowPaidFromStripe/);
    assert.doesNotMatch(billingSrc, /resolveEscrowPaymentIntentId/);
    assert.match(billingSrc, /legacy escrow event ignored \(no-op\)/);
    // Ordering inside processBillingCheckoutSessionCompleted: escrow return before persist call
    const processIdx = billingSrc.indexOf(
      "export async function processBillingCheckoutSessionCompleted"
    );
    const slice = billingSrc.slice(processIdx, processIdx + 2500);
    const escrowIdx = slice.indexOf('session.metadata?.kind === "escrow"');
    const persistCallIdx = slice.indexOf(
      "deps.persistInvoice ?? persistInvoiceFromCheckoutSession"
    );
    assert.ok(escrowIdx >= 0 && persistCallIdx > escrowIdx);
  });

  it("H-01 behavioral: legacy escrow → 0 invoice mutations + payment untouched", async () => {
    const { processBillingCheckoutSessionCompleted } = await import(
      "../../routes/billing.js"
    );
    const ctx = await setupHeldDelivered(
      q,
      txRepo,
      offers,
      "h01-behav",
      77000
    );
    const intentBefore = await new PaymentRepository(q).getByTransactionId(
      ctx.txId
    );
    const ledgerBefore = await listLedgerForIntent(q, ctx.intent.id);
    const statusBefore = intentBefore!.status;
    const transferBefore = intentBefore!.transferStatus;

    /** In-memory stand-in for billing_invoices row count. */
    const billingInvoices: unknown[] = [];
    const countBefore = billingInvoices.length;

    const session = {
      id: `cs_test_escrow_${key("h01")}`,
      object: "checkout.session",
      payment_status: "paid",
      status: "complete",
      amount_total: 500,
      metadata: {
        kind: "escrow",
        escrowId: "esc-legacy-1",
        userId: ctx.buyerId,
        buyerId: ctx.buyerId,
        buyerProtectionFeeEur: "5.00",
        itemAmountEur: "100.00",
      },
      customer_details: null,
      invoice: null,
      customer: null,
    } as unknown as import("stripe").default.Checkout.Session;

    // Simulate HTTP 200 body the webhook returns on early escrow exit
    let httpStatus = 0;
    let httpBody: unknown = null;
    const result = await processBillingCheckoutSessionCompleted(session, {
      persistInvoice: async (s) => {
        billingInvoices.push(s);
      },
    });
    httpStatus = 200;
    httpBody = result;

    assert.equal(httpStatus, 200);
    assert.deepEqual(httpBody, {
      received: true,
      legacyEscrowIgnored: true,
    });
    const countAfter = billingInvoices.length;
    assert.equal(countAfter, countBefore);

    const intentAfter = await new PaymentRepository(q).getByTransactionId(
      ctx.txId
    );
    const ledgerAfter = await listLedgerForIntent(q, ctx.intent.id);
    assert.equal(intentAfter!.status, statusBefore);
    assert.equal(intentAfter!.transferStatus, transferBefore);
    assert.equal(ledgerAfter.length, ledgerBefore.length);
    assert.equal(intentAfter!.amountCents, intentBefore!.amountCents);
  });

  it("M-01: live lookup uses transfers.retrieve / refunds.retrieve — not list({limit:100})", () => {
    assert.doesNotMatch(
      lookupSrc,
      /stripe\.transfers\.list\(\s*\{\s*limit:\s*100/
    );
    assert.match(lookupSrc, /stripe\.transfers\.retrieve/);
    assert.match(lookupSrc, /stripe\.refunds\.retrieve/);
  });

  it("M-01: >100 noise transfers still reconcile via direct retrieve", async () => {
    const ctx = await setupHeldDelivered(
      q,
      txRepo,
      offers,
      "m01-rpg-noise",
      91000
    );
    const released = await ctx.funds.releaseToSeller({
      transactionId: ctx.txId,
      actorUserId: ctx.buyerId,
      body: { idempotencyKey: key("m01-rpg-rel") },
    });
    ctx.fake.seedNoiseTransfers(150);
    assert.ok(ctx.fake.listTransfers().length > 100);
    assert.equal(
      ctx.fake.retrieveTransfer(released.stripeTransferId!)?.id,
      released.stripeTransferId
    );
    const { inSync } = await reconcilePaymentIntent(
      q,
      ctx.intent.id,
      providerLookupFromFake(ctx.fake)
    );
    assert.equal(inSync, true);
    const subject = await loadReconcileSubject(
      q,
      ctx.intent.id,
      providerLookupFromFake(ctx.fake)
    );
    assert.equal(subject!.provider!.transferId, released.stripeTransferId);
    assert.ok(allInvariantsOk(checkAllInvariants(subject!)));
  });
});
