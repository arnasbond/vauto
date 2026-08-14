/**
 * Stage 11F.1 — Payment Domain & Ledger 1.0 (150+ tests).
 * Server-authoritative amounts, reconciliation, immutability, idempotency, IDOR.
 * NO external Stripe API calls.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  OFFERS_MIGRATION_SQL,
  OfferEngine,
} from "../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../deal-room/index.js";
import {
  PAYMENT_LEDGER_VERSION,
  PAYMENT_LEDGER_MIGRATION_SQL,
  createPaymentIntentService,
  CreatePaymentIntentBodySchema,
  CreatePaymentIntentResultSchema,
  PaymentIntentSchema,
  FinancialReconciliationError,
  PaymentAuthError,
  PaymentNotFoundError,
  PaymentStateError,
  PaymentIdempotencyConflictError,
  computeLedgerEntryHash,
  reconcileSnapshotAgainstAcceptedOffer,
} from "../index.js";

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

const LISTINGS_STUB = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(12,2),
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active'
);
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("11F.1 Payment Domain & Ledger", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-idem-${++seq}-${Date.now()}`;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(PAYMENT_LEDGER_MIGRATION_SQL);
    await db.exec(LISTINGS_STUB);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function seedListing(
    id: string,
    title: string,
    priceEuro: number,
    attrs: Record<string, unknown> = { color: "juoda" }
  ) {
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes, status)
       VALUES ($1,$2,$3,'https://img.example/a.jpg',$4::jsonb,'active')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price, attributes = EXCLUDED.attributes`,
      [id, title, priceEuro, JSON.stringify(attrs)]
    );
  }

  async function setupAgreed(tag: string, offerCents = 95000, ask = 1100) {
    const listingId = `L-${tag}`;
    await seedListing(listingId, `Skelbimas ${tag}`, ask, { tag });
    const buyerId = `buyer-${tag}`;
    const sellerId = `seller-${tag}`;
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: ask,
    });
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: offerCents,
      idempotencyKey: key(`c-${tag}`),
    });
    const accepted = await offers.accept({
      offerId: created.offer.id,
      actorUserId: sellerId,
      idempotencyKey: key(`a-${tag}`),
      expectedVersion: created.offer.version,
    });
    const svc = createPaymentIntentService(q);
    return {
      tx: accepted.transaction,
      buyerId,
      sellerId,
      offer: accepted.offer,
      svc,
      listingId,
      offerCents,
    };
  }

  it("exports paymentLedgerVersion 1.0", () => {
    assert.equal(PAYMENT_LEDGER_VERSION, "1.0");
  });

  it("migration SQL file is 044_payment_domain_ledger_1.0", () => {
    const sqlPath = path.resolve(
      __dirname,
      "../../../migrations/044_payment_domain_ledger_1.0.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    assert.match(sql, /vauto_payment_intents/);
    assert.match(sql, /vauto_payment_ledger/);
    assert.match(sql, /append-only/i);
    assert.match(sql, /NO external Stripe/i);
    assert.doesNotMatch(sql, /stripe\.(paymentIntents|charges)/i);
  });

  it("payment module source has zero Stripe API executions", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "payment-intent-service.ts",
      "ledger-service.ts",
      "reconciliation-service.ts",
      "repository.ts",
      "schema.ts",
      "types.ts",
      "index.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(root, f), "utf8");
      assert.doesNotMatch(src, /stripe\.(paymentIntents|charges|checkout)/i);
      assert.doesNotMatch(src, /new\s+Stripe\s*\(/);
    }
  });

  // —— Version / schema (10) ——
  for (let i = 0; i < 10; i++) {
    it(`schema accepts only idempotencyKey #${i}`, () => {
      const parsed = CreatePaymentIntentBodySchema.parse({
        idempotencyKey: `valid-key-${i}-xxxxxx`,
      });
      assert.equal(parsed.idempotencyKey.startsWith("valid-key"), true);
    });
  }

  for (let i = 0; i < 8; i++) {
    it(`schema rejects client amount/currency/status #${i}`, () => {
      const bodies = [
        { idempotencyKey: "abcdefgh", amountCents: 1 },
        { idempotencyKey: "abcdefgh", amount: 10 },
        { idempotencyKey: "abcdefgh", currency: "EUR" },
        { idempotencyKey: "abcdefgh", sellerId: "x" },
        { idempotencyKey: "abcdefgh", status: "CREATED" },
        { idempotencyKey: "abcdefgh", buyerId: "y" },
        { idempotencyKey: "abcdefgh", dealSnapshotId: "z" },
        { idempotencyKey: "abcdefgh", transactionId: "t" },
      ];
      assert.throws(() => CreatePaymentIntentBodySchema.parse(bodies[i]));
    });
  }

  // —— Server-authoritative amount (25) ——
  for (let i = 0; i < 25; i++) {
    it(`server-authoritative amount from snapshot #${i}`, async () => {
      const cents = 70000 + i * 137;
      const { tx, buyerId, svc, offerCents } = await setupAgreed(
        `amt-${i}`,
        cents
      );
      const result = await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: {
          idempotencyKey: key(`pay-${i}`),
          // attacker fields must be ignored by Zod .strict() — we only pass key
        },
      });
      assert.equal(result.paymentIntent.amountCents, offerCents);
      assert.equal(result.paymentIntent.amountCents, cents);
      assert.equal(result.paymentIntent.currency, "EUR");
      assert.equal(result.paymentIntent.status, "CREATED");
      assert.equal(result.paymentLedgerVersion, "1.0");
      assert.equal(result.transaction.status, "PAYMENT_PENDING");
      assert.equal(result.ledgerEntry.amountCents, cents);
      assert.equal(result.ledgerEntry.entryType, "DEBIT");
      PaymentIntentSchema.parse(result.paymentIntent);
      CreatePaymentIntentResultSchema.parse(result);
    });
  }

  // —— Client amount injection rejected at schema (10) ——
  for (let i = 0; i < 10; i++) {
    it(`rejects injected client price at parse #${i}`, async () => {
      const { tx, buyerId, svc } = await setupAgreed(`inj-${i}`, 88000 + i);
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: {
              idempotencyKey: key(`inj-${i}`),
              amountCents: 1,
            },
          }),
        (e: unknown) => e instanceof Error
      );
    });
  }

  // —— Reconciliation mismatch fail-closed (15) ——
  for (let i = 0; i < 15; i++) {
    it(`reconciliation mismatch fail-closed #${i}`, async () => {
      const { tx, buyerId, svc, offerCents } = await setupAgreed(
        `rec-${i}`,
        91000 + i
      );
      // Corrupt accepted offer cents after snapshot freeze (DB-level attack simulation)
      await q.query(
        `UPDATE vauto_offers SET amount_cents = $1 WHERE id IN (
           SELECT accepted_offer_id FROM vauto_deal_snapshots WHERE transaction_id = $2
         )`,
        [offerCents + 999 + i, tx.id]
      );
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: { idempotencyKey: key(`rec-${i}`) },
          }),
        (e: unknown) => e instanceof FinancialReconciliationError
      );
      const count = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_payment_intents WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(count.rows[0]!.c), 0);
      const led = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_payment_ledger WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(led.rows[0]!.c), 0);
    });
  }

  it("reconcile helper returns matching cents", async () => {
    const { tx, offerCents } = await setupAgreed("rec-ok", 123456);
    const facts = await reconcileSnapshotAgainstAcceptedOffer(q, tx.id);
    assert.equal(facts.snapshotAmountCents, offerCents);
    assert.equal(facts.offerAmountCents, offerCents);
  });

  // —— Idempotency: 10 repeats → exactly 1 intent (plus variants) ——
  it("idempotency: 10 identical creates → exactly 1 intent + 1 debit", async () => {
    const { tx, buyerId, svc, offerCents } = await setupAgreed("idem-10", 77700);
    const idem = key("idem-burst");
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        await svc.createPaymentIntent({
          transactionId: tx.id,
          actorUserId: buyerId,
          body: { idempotencyKey: idem },
        })
      );
    }
    assert.equal(results[0]!.idempotentReplay, false);
    for (let i = 1; i < 10; i++) {
      assert.equal(results[i]!.idempotentReplay, true);
      assert.equal(results[i]!.paymentIntent.id, results[0]!.paymentIntent.id);
      assert.equal(results[i]!.paymentIntent.amountCents, offerCents);
    }
    const count = await q.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM vauto_payment_intents WHERE transaction_id = $1`,
      [tx.id]
    );
    assert.equal(Number(count.rows[0]!.c), 1);
    const led = await q.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM vauto_payment_ledger WHERE payment_intent_id = $1`,
      [results[0]!.paymentIntent.id]
    );
    assert.equal(Number(led.rows[0]!.c), 1);
  });

  for (let i = 0; i < 10; i++) {
    it(`idempotency replay preserves amount #${i}`, async () => {
      const { tx, buyerId, svc, offerCents } = await setupAgreed(
        `idem-r-${i}`,
        66000 + i
      );
      const idem = key(`ir-${i}`);
      const a = await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: idem },
      });
      const b = await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: idem },
      });
      assert.equal(b.idempotentReplay, true);
      assert.equal(a.paymentIntent.amountCents, offerCents);
      assert.equal(b.paymentIntent.amountCents, a.paymentIntent.amountCents);
      assert.equal(b.paymentIntent.id, a.paymentIntent.id);
    });
  }

  it("different idempotency key on same tx → conflict", async () => {
    const { tx, buyerId, svc } = await setupAgreed("idem-conflict", 55000);
    await svc.createPaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("first") },
    });
    await assert.rejects(
      () =>
        svc.createPaymentIntent({
          transactionId: tx.id,
          actorUserId: buyerId,
          body: { idempotencyKey: key("second") },
        }),
      (e: unknown) => e instanceof PaymentIdempotencyConflictError
    );
  });

  // —— IDOR (20) ——
  for (let i = 0; i < 20; i++) {
    it(`IDOR stranger create/get → 404 class #${i}`, async () => {
      const { tx, buyerId, sellerId, svc } = await setupAgreed(
        `idor-${i}`,
        80000 + i
      );
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: tx.id,
            actorUserId: `stranger-${i}`,
            body: { idempotencyKey: key(`idor-c-${i}`) },
          }),
        (e: unknown) =>
          e instanceof PaymentAuthError || e instanceof PaymentNotFoundError
      );
      // Seller cannot initiate
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: tx.id,
            actorUserId: sellerId,
            body: { idempotencyKey: key(`idor-s-${i}`) },
          }),
        (e: unknown) => e instanceof PaymentAuthError
      );
      await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`idor-ok-${i}`) },
      });
      await assert.rejects(
        () =>
          svc.getPaymentIntent({
            transactionId: tx.id,
            actorUserId: `stranger-g-${i}`,
          }),
        (e: unknown) =>
          e instanceof PaymentAuthError || e instanceof PaymentNotFoundError
      );
      const sellerView = await svc.getPaymentIntent({
        transactionId: tx.id,
        actorUserId: sellerId,
      });
      assert.equal(sellerView.paymentIntent.transactionId, tx.id);
    });
  }

  // —— Ledger immutability (15) ——
  for (let i = 0; i < 15; i++) {
    it(`ledger UPDATE/DELETE forbidden #${i}`, async () => {
      const { tx, buyerId, svc } = await setupAgreed(`imm-${i}`, 72000 + i);
      const created = await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`imm-${i}`) },
      });
      await assert.rejects(async () => {
        await q.query(
          `UPDATE vauto_payment_ledger SET amount_cents = 1 WHERE id = $1`,
          [created.ledgerEntry.id]
        );
      });
      await assert.rejects(async () => {
        await q.query(`DELETE FROM vauto_payment_ledger WHERE id = $1`, [
          created.ledgerEntry.id,
        ]);
      });
      await assert.rejects(async () => {
        await q.query(
          `UPDATE vauto_payment_intents SET amount_cents = 1 WHERE id = $1`,
          [created.paymentIntent.id]
        );
      });
      await assert.rejects(async () => {
        await q.query(`DELETE FROM vauto_payment_intents WHERE id = $1`, [
          created.paymentIntent.id,
        ]);
      });
    });
  }

  // —— Escrow hold / release / SM integration (20) ——
  for (let i = 0; i < 20; i++) {
    it(`hold + release → PAID with ledger trail #${i}`, async () => {
      const { tx, buyerId, svc, offerCents } = await setupAgreed(
        `esc-${i}`,
        99000 + i
      );
      const created = await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`esc-c-${i}`) },
      });
      assert.equal(created.transaction.status, "PAYMENT_PENDING");
      const held = await svc.holdInEscrow({
        transactionId: tx.id,
        actorUserId: buyerId,
        idempotencyKey: key(`esc-h-${i}`),
      });
      assert.equal(held.status, "HELD_IN_ESCROW");
      assert.equal(held.amountCents, offerCents);
      const released = await svc.releaseToSeller({
        transactionId: tx.id,
        idempotencyKey: key(`esc-r-${i}`),
      });
      assert.equal(released.status, "RELEASED_TO_SELLER");
      const live = (await txRepo.getById(tx.id))!;
      assert.equal(live.status, "PAID");
      const view = await svc.getPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
      });
      assert.ok(view.ledger.length >= 3);
      assert.ok(view.ledger.some((e) => e.entryType === "DEBIT"));
      assert.ok(view.ledger.some((e) => e.entryType === "ESCROW_HOLD"));
      assert.ok(view.ledger.some((e) => e.entryType === "ESCROW_RELEASE"));
      const last = view.ledger[view.ledger.length - 1]!;
      assert.equal(last.runningBalanceCents, 0);
    });
  }

  // —— Refund path (10) ——
  for (let i = 0; i < 10; i++) {
    it(`refund from escrow #${i}`, async () => {
      const { tx, buyerId, svc } = await setupAgreed(`ref-${i}`, 61000 + i);
      await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`ref-c-${i}`) },
      });
      await svc.holdInEscrow({
        transactionId: tx.id,
        actorUserId: buyerId,
        idempotencyKey: key(`ref-h-${i}`),
      });
      const refunded = await svc.refund({
        transactionId: tx.id,
        actorUserId: buyerId,
        idempotencyKey: key(`ref-r-${i}`),
      });
      assert.equal(refunded.status, "REFUNDED");
      const view = await svc.getPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
      });
      assert.ok(view.ledger.some((e) => e.entryType === "REFUND"));
    });
  }

  // —— Fail path + state guards (10) ——
  for (let i = 0; i < 5; i++) {
    it(`markFailed from CREATED #${i}`, async () => {
      const { tx, buyerId, svc } = await setupAgreed(`fail-${i}`, 51000 + i);
      await svc.createPaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`fail-c-${i}`) },
      });
      const failed = await svc.markFailed({
        transactionId: tx.id,
        actorUserId: buyerId,
        idempotencyKey: key(`fail-m-${i}`),
      });
      assert.equal(failed.status, "FAILED");
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`cannot create payment before AGREED #${i}`, async () => {
      const listingId = `L-pre-${i}`;
      await seedListing(listingId, `Pre ${i}`, 100);
      const buyerId = `buyer-pre-${i}`;
      const sellerId = `seller-pre-${i}`;
      const tx = await txRepo.create({
        listingId,
        buyerId,
        sellerId,
        currentPrice: 100,
      });
      await offers.create({
        transactionId: tx.id,
        actorUserId: buyerId,
        amountCents: 9000 + i,
        idempotencyKey: key(`pre-c-${i}`),
      });
      const svc = createPaymentIntentService(q);
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: { idempotencyKey: key(`pre-p-${i}`) },
          }),
        (e: unknown) =>
          e instanceof PaymentStateError ||
          e instanceof FinancialReconciliationError
      );
    });
  }

  // —— Ledger hash determinism (8) ——
  for (let i = 0; i < 8; i++) {
    it(`ledger entry hash stable #${i}`, () => {
      const input = {
        paymentIntentId: `pi-${i}`,
        transactionId: `tx-${i}`,
        entryType: "DEBIT" as const,
        amountCents: 1000 + i,
        runningBalanceCents: 1000 + i,
        currency: "EUR" as const,
        actorId: `actor-${i}`,
        idempotencyKey: `hash-key-${i}-xxxx`,
        payloadJson: { n: i },
      };
      const a = computeLedgerEntryHash(input);
      const b = computeLedgerEntryHash(input);
      assert.equal(a, b);
      assert.equal(a.length, 64);
    });
  }

  // —— Missing / unknown transaction (5) ——
  for (let i = 0; i < 5; i++) {
    it(`unknown transaction → not found #${i}`, async () => {
      const svc = createPaymentIntentService(q);
      await assert.rejects(
        () =>
          svc.createPaymentIntent({
            transactionId: `missing-tx-${i}`,
            actorUserId: `buyer-x-${i}`,
            body: { idempotencyKey: key(`miss-${i}`) },
          }),
        (e: unknown) =>
          e instanceof PaymentNotFoundError || e instanceof PaymentAuthError
      );
      await assert.rejects(
        () =>
          svc.getPaymentIntent({
            transactionId: `missing-tx-g-${i}`,
            actorUserId: `buyer-x-${i}`,
          }),
        (e: unknown) =>
          e instanceof PaymentNotFoundError || e instanceof PaymentAuthError
      );
    });
  }

  // —— Status machine domain (5) ——
  it("cannot release before hold", async () => {
    const { tx, buyerId, svc } = await setupAgreed("no-rel", 42000);
    await svc.createPaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("no-rel") },
    });
    await assert.rejects(
      () =>
        svc.releaseToSeller({
          transactionId: tx.id,
          idempotencyKey: key("no-rel-r"),
        }),
      (e: unknown) => e instanceof PaymentStateError
    );
  });

  it("cannot refund before hold", async () => {
    const { tx, buyerId, svc } = await setupAgreed("no-ref", 43000);
    await svc.createPaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("no-ref") },
    });
    await assert.rejects(
      () =>
        svc.refund({
          transactionId: tx.id,
          actorUserId: buyerId,
          idempotencyKey: key("no-ref-r"),
        }),
      (e: unknown) => e instanceof PaymentStateError
    );
  });

  it("hold is idempotent when already held", async () => {
    const { tx, buyerId, svc } = await setupAgreed("hold-idem", 44000);
    await svc.createPaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("hold-idem-c") },
    });
    const a = await svc.holdInEscrow({
      transactionId: tx.id,
      actorUserId: buyerId,
      idempotencyKey: key("hold-idem-h1"),
    });
    const b = await svc.holdInEscrow({
      transactionId: tx.id,
      actorUserId: buyerId,
      idempotencyKey: key("hold-idem-h2"),
    });
    assert.equal(a.status, "HELD_IN_ESCROW");
    assert.equal(b.status, "HELD_IN_ESCROW");
    assert.equal(a.id, b.id);
  });

  it("release is idempotent when already released", async () => {
    const { tx, buyerId, svc } = await setupAgreed("rel-idem", 45000);
    await svc.createPaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("rel-idem-c") },
    });
    await svc.holdInEscrow({
      transactionId: tx.id,
      actorUserId: buyerId,
      idempotencyKey: key("rel-idem-h"),
    });
    const a = await svc.releaseToSeller({
      transactionId: tx.id,
      idempotencyKey: key("rel-idem-r1"),
    });
    const b = await svc.releaseToSeller({
      transactionId: tx.id,
      idempotencyKey: key("rel-idem-r2"),
    });
    assert.equal(a.status, "RELEASED_TO_SELLER");
    assert.equal(b.status, "RELEASED_TO_SELLER");
  });

  it("get without intent → not found", async () => {
    const { tx, buyerId, svc } = await setupAgreed("no-intent", 46000);
    await assert.rejects(
      () =>
        svc.getPaymentIntent({
          transactionId: tx.id,
          actorUserId: buyerId,
        }),
      (e: unknown) => e instanceof PaymentNotFoundError
    );
  });
});
