/**
 * Stage 11F.5 — Financial reconciliation suite (~150+).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { TransactionRepository, TxQueryable } from "../../transaction/index.js";
import type { OfferEngine } from "../../transaction/offers/index.js";
import { PaymentRepository } from "../../payment/index.js";
import {
  PAYMENT_RECONCILIATION_VERSION,
  checkAllInvariants,
  allInvariantsOk,
  loadReconcileSubject,
  reconcilePaymentIntent,
  reconcileBatch,
  runBoundedReconciliationWorker,
  classifySubject,
  applySafeRepairs,
  ReconciliationReportSchema,
} from "../reconciliation/index.js";
import { calculatePlatformFeeSplit as feeSplit } from "../transfer/fee-calculator.js";
import {
  bootFinancialDb,
  setupHeldDelivered,
  providerLookupFromFake,
  key,
} from "./financial-harness.js";

describe("11F.5 Financial Reconciliation", () => {
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

  it("exports paymentReconciliationVersion 1.0", () => {
    assert.equal(PAYMENT_RECONCILIATION_VERSION, "1.0");
  });

  // —— 50 ledger conservation & invariants ——
  for (let i = 0; i < 50; i++) {
    it(`ledger conservation after hold #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `inv-${i}`,
        80000 + i * 17
      );
      const subject = await loadReconcileSubject(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.ok(subject);
      const checks = checkAllInvariants(subject!);
      assert.equal(allInvariantsOk(checks), true, JSON.stringify(checks));
      assert.equal(subject!.snapshotAmountCents, ctx.offerCents);
      assert.equal(subject!.grossAmountCents, ctx.offerCents);
    });
  }

  // —— 40 provider drift detection ——
  for (let i = 0; i < 20; i++) {
    it(`provider amount tamper → SECURITY_MISMATCH #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `drift-${i}`,
        90000 + i
      );
      ctx.fake.tamperPaymentIntentAmount(
        ctx.stripePaymentIntentId,
        ctx.offerCents + 500
      );
      const { findings } = await reconcilePaymentIntent(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.ok(
        findings.some((f) => f.classification === "SECURITY_MISMATCH")
      );
      const repairs = await applySafeRepairs(q, findings, null, new Map());
      assert.ok(repairs.every((r) => !r.applied || r.action !== "fix_amount"));
    });
  }

  for (let i = 0; i < 20; i++) {
    it(`currency mismatch → SECURITY_MISMATCH #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `cur-${i}`,
        91000 + i
      );
      const subject = await loadReconcileSubject(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.ok(subject);
      subject!.provider = {
        ...subject!.provider!,
        currency: "usd",
        amountCents: ctx.offerCents,
      };
      const findings = classifySubject(subject!, checkAllInvariants(subject!));
      assert.ok(findings.some((f) => f.code === "CURRENCY_MISMATCH"));
      assert.ok(findings.every((f) => f.safeAutoHeal === false || f.code !== "CURRENCY_MISMATCH"));
    });
  }

  // —— 40 webhook + recon (in-sync after success path) ——
  for (let i = 0; i < 40; i++) {
    it(`post-webhook reconcile in sync #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `whr-${i}`,
        92000 + i
      );
      const { inSync, findings } = await reconcilePaymentIntent(
        q,
        ctx.intent.id,
        providerLookupFromFake(ctx.fake)
      );
      assert.equal(inSync, true);
      assert.equal(
        findings.filter((f) => f.classification !== "IN_SYNC").length,
        0
      );
    });
  }

  // —— 30 crash window / recoverable ——
  for (let i = 0; i < 30; i++) {
    it(`recoverable missing stripe link auto-heal #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `recov-${i}`,
        93000 + i
      );
      // Simulate DB lost stripe id while provider still has PI
      await q.query(
        `UPDATE vauto_payment_intents SET stripe_payment_intent_id = NULL WHERE id = $1`,
        [ctx.intent.id]
      );
      const provider: ReturnType<typeof providerLookupFromFake> = {
        ...providerLookupFromFake(ctx.fake),
        async lookupRecoverableLink(paymentIntentId) {
          if (paymentIntentId !== ctx.intent.id) return null;
          return {
            stripePaymentIntentId: ctx.stripePaymentIntentId,
            mirror: {
              paymentIntentId: ctx.stripePaymentIntentId,
              amountCents: ctx.offerCents,
              currency: "eur",
              status: "succeeded",
              transferId: null,
              transferAmountCents: null,
              refundId: null,
              refundAmountCents: null,
              reversalAmountCents: null,
            },
          };
        },
      };
      const { findings } = await reconcilePaymentIntent(q, ctx.intent.id, provider, {
        async attachStripePaymentIntentId(input) {
          await q.query(
            `UPDATE vauto_payment_intents SET stripe_payment_intent_id = $1 WHERE id = $2`,
            [input.stripePaymentIntentId, input.paymentIntentId]
          );
        },
      });
      assert.ok(findings.some((f) => f.classification === "RECOVERABLE_DRIFT"));
      const row = await new PaymentRepository(q).getById(ctx.intent.id);
      assert.equal(row!.stripePaymentIntentId, ctx.stripePaymentIntentId);
    });
  }

  // —— fee split math via fee calculator ——
  for (let i = 0; i < 15; i++) {
    it(`fee split integer invariant #${i}`, () => {
      const g = 1000 + i * 333;
      const s = feeSplit(g);
      assert.equal(s.grossAmountCents, s.platformFeeCents + s.sellerNetCents);
    });
  }

  // —— worker / batch / report ——
  it("bounded worker paginates", async () => {
    for (let i = 0; i < 3; i++) {
      await setupHeldDelivered(q, txRepo, offers, `page-${i}`, 94000 + i);
    }
    const out = await runBoundedReconciliationWorker({
      db: q,
      batchSize: 2,
      maxPages: 5,
      provider: null,
    });
    assert.ok(out.pages >= 1);
    assert.ok(out.totals.scanned >= 2);
    assert.equal(out.paymentReconciliationVersion, "1.0");
  });

  it("reconcileBatch report schema is operator-safe", async () => {
    const report = await reconcileBatch(q, { limit: 10 });
    ReconciliationReportSchema.parse(report);
    assert.doesNotMatch(JSON.stringify(report), /sk_live|whsec_/);
  });

  // —— privacy / no secrets (10) ——
  for (let i = 0; i < 10; i++) {
    it(`report privacy #${i}`, async () => {
      const ctx = await setupHeldDelivered(
        q,
        txRepo,
        offers,
        `priv-${i}`,
        95000 + i
      );
      const report = await reconcileBatch(q, {
        limit: 5,
        provider: providerLookupFromFake(ctx.fake),
      });
      const json = JSON.stringify(report);
      assert.doesNotMatch(json, /client_secret|sk_test|whsec_/);
      ReconciliationReportSchema.parse(report);
    });
  }

  // —— IDOR-ish: reconcile only by id (5) ——
  for (let i = 0; i < 5; i++) {
    it(`unknown payment intent throws #${i}`, async () => {
      await assert.rejects(() =>
        reconcilePaymentIntent(q, `missing-pi-${i}`, null)
      );
    });
  }

  // —— Stage 11F.7 M-01: >100 noise transfers + direct retrieve ——
  it("reconciles target transfer amid >100 noise via retrieve(id)", async () => {
    const ctx = await setupHeldDelivered(
      q,
      txRepo,
      offers,
      "m01-noise",
      99000
    );
    const released = await ctx.funds.releaseToSeller({
      transactionId: ctx.txId,
      actorUserId: ctx.buyerId,
      body: { idempotencyKey: key("m01-noise-rel") },
    });
    assert.ok(released.stripeTransferId);

    ctx.fake.seedNoiseTransfers(120);
    assert.ok(ctx.fake.listTransfers().length > 100);

    // Direct retrieve finds the deal transfer even when list is flooded
    const byId = ctx.fake.retrieveTransfer(released.stripeTransferId!);
    assert.ok(byId);
    assert.equal(byId!.id, released.stripeTransferId);
    assert.equal(byId!.metadata?.vautoTransactionId, ctx.txId);

    const { inSync, findings } = await reconcilePaymentIntent(
      q,
      ctx.intent.id,
      providerLookupFromFake(ctx.fake)
    );
    assert.equal(inSync, true);
    assert.equal(findings.length, 0);

    const subject = await loadReconcileSubject(
      q,
      ctx.intent.id,
      providerLookupFromFake(ctx.fake)
    );
    assert.equal(subject!.provider!.transferId, released.stripeTransferId);
    assert.ok(allInvariantsOk(checkAllInvariants(subject!)));
  });

  it("H-01 behavioral: escrow checkout no-op before invoice persist", async () => {
    const { processBillingCheckoutSessionCompleted } = await import(
      "../../routes/billing.js"
    );
    const invoices: unknown[] = [];
    const countBefore = invoices.length;
    const result = await processBillingCheckoutSessionCompleted(
      {
        id: "cs_test_legacy_escrow",
        object: "checkout.session",
        payment_status: "paid",
        status: "complete",
        amount_total: 1200,
        metadata: {
          kind: "escrow",
          escrowId: "esc-x",
          userId: "buyer-h01",
          buyerProtectionFeeEur: "12.00",
        },
        customer_details: null,
        invoice: null,
        customer: null,
      } as unknown as import("stripe").default.Checkout.Session,
      {
        persistInvoice: async (s) => {
          invoices.push(s);
        },
      }
    );
    assert.deepEqual(result, {
      received: true,
      legacyEscrowIgnored: true,
    });
    assert.equal(invoices.length, countBefore);
  });
});
