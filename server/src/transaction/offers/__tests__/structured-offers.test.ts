/**
 * Stage 11B — Structured Offers unit / schema / validator suite.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AmountCentsSchema,
  CreateOfferBodySchema,
  CounterOfferBodySchema,
  OfferActionBodySchema,
  STRUCTURED_OFFERS_VERSION,
  VautoOfferSchema,
  OfferAuthError,
  assertCounterpartyAction,
  assertCanWithdraw,
  assertOfferPending,
  assertNotExpired,
  resolveActorRole,
  type VautoOffer,
} from "../index.js";
import type { VautoTransaction } from "../../index.js";
import {
  TRANSACTION_STATE_MACHINE_VERSION,
  LEGACY_TRANSACTION_POLICY,
} from "../../index.js";

function offer(partial: Partial<VautoOffer> = {}): VautoOffer {
  return {
    id: "o1",
    transactionId: "t1",
    listingId: "L1",
    buyerId: "buyer",
    sellerId: "seller",
    createdByUserId: "buyer",
    parentOfferId: null,
    amountCents: 69999,
    currency: "EUR",
    status: "PENDING",
    version: 0,
    idempotencyKey: "idem-0001",
    expiresAt: null,
    offersVersion: STRUCTURED_OFFERS_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function tx(partial: Partial<VautoTransaction> = {}): VautoTransaction {
  return {
    id: "t1",
    listingId: "L1",
    buyerId: "buyer",
    sellerId: "seller",
    status: "DISCUSSION",
    currentPrice: null,
    currency: "EUR",
    version: 0,
    idempotencyKey: null,
    stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...LEGACY_TRANSACTION_POLICY,
    ...partial,
  };
}

describe("11B version & money schema", () => {
  it("exports offersVersion 1.0", () => {
    assert.equal(STRUCTURED_OFFERS_VERSION, "1.0");
  });

  // 40 create-oriented amount validations
  const validCents = [
    1, 2, 99, 100, 101, 500, 999, 1000, 2500, 69999, 100000, 999999,
    50, 75, 80, 120, 150, 200, 250, 300, 400, 450, 550, 600, 700, 800,
    900, 1100, 1500, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 25000,
    50000, 75000, 19999,
  ];
  for (const c of validCents) {
    it(`create accepts amountCents=${c}`, () => {
      const p = CreateOfferBodySchema.parse({
        amountCents: c,
        idempotencyKey: `create-ok-${c}-xx`,
      });
      assert.equal(p.amountCents, c);
      assert.equal(p.currency, "EUR");
    });
  }

  const invalidAmounts: unknown[] = [
    0, -1, -100, 1.5, 699.99, NaN, Infinity, "69999", null, undefined,
    true, {}, [], 0.01, -0.01,
  ];
  for (const [i, v] of invalidAmounts.entries()) {
    it(`rejects non-integer-cents #${i} (${String(v)})`, () => {
      assert.throws(() => AmountCentsSchema.parse(v));
    });
  }

  it("rejects client status injection on create", () => {
    assert.throws(() =>
      CreateOfferBodySchema.parse({
        amountCents: 100,
        idempotencyKey: "inject-status-01",
        status: "ACCEPTED",
      } as never)
    );
  });

  it("rejects buyerId injection on create", () => {
    assert.throws(() =>
      CreateOfferBodySchema.parse({
        amountCents: 100,
        idempotencyKey: "inject-buyer-01",
        buyerId: "hacker",
      } as never)
    );
  });

  it("rejects float euro amount field aliases", () => {
    assert.throws(() =>
      CreateOfferBodySchema.parse({
        amountCents: 100,
        idempotencyKey: "inject-amount-01",
        amount: 1.5,
      } as never)
    );
  });

  it("parses counter + action bodies", () => {
    CounterOfferBodySchema.parse({
      amountCents: 50000,
      idempotencyKey: "counter-body-01",
      expectedVersion: 0,
    });
    OfferActionBodySchema.parse({
      idempotencyKey: "action-body-01",
      expectedVersion: 2,
    });
  });

  it("VautoOfferSchema requires integer cents + EUR", () => {
    const parsed = VautoOfferSchema.parse(offer());
    assert.equal(parsed.offersVersion, "1.0");
    assert.throws(() =>
      VautoOfferSchema.parse(offer({ amountCents: 10.5 as never }))
    );
  });
});

describe("11B role / IDOR validators", () => {
  it("resolves buyer and seller roles", () => {
    assert.equal(resolveActorRole("buyer", tx()), "BUYER");
    assert.equal(resolveActorRole("seller", tx()), "SELLER");
  });

  it("rejects stranger identity", () => {
    assert.throws(
      () => resolveActorRole("stranger", tx()),
      OfferAuthError
    );
  });

  // 20 IDOR-style validator cases
  const strangers = Array.from({ length: 20 }, (_, i) => `intruder-${i}`);
  for (const s of strangers) {
    it(`IDOR: ${s} cannot act as counterparty accept`, () => {
      assert.throws(
        () => assertCounterpartyAction(s, offer(), "accept"),
        OfferAuthError
      );
    });
  }

  it("creator cannot accept own offer", () => {
    assert.throws(
      () => assertCounterpartyAction("buyer", offer(), "accept"),
      OfferAuthError
    );
  });

  it("seller can accept buyer offer", () => {
    assert.doesNotThrow(() =>
      assertCounterpartyAction("seller", offer(), "accept")
    );
  });

  it("buyer can accept seller counter", () => {
    assert.doesNotThrow(() =>
      assertCounterpartyAction(
        "buyer",
        offer({ createdByUserId: "seller" }),
        "accept"
      )
    );
  });

  it("only creator withdraws", () => {
    assert.throws(
      () => assertCanWithdraw("seller", offer()),
      OfferAuthError
    );
    assert.doesNotThrow(() => assertCanWithdraw("buyer", offer()));
  });

  it("pending + expiry checks", () => {
    assert.doesNotThrow(() => assertOfferPending(offer()));
    assert.throws(() => assertOfferPending(offer({ status: "ACCEPTED" })));
    assert.throws(() =>
      assertNotExpired(
        offer({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      )
    );
  });
});

describe("11B adversarial / malformed payloads", () => {
  const malformed = [
    {},
    { amountCents: 100 },
    { idempotencyKey: "short", amountCents: 100 },
    { amountCents: 100, idempotencyKey: "x".repeat(8), currency: "USD" },
    { amountCents: 100, idempotencyKey: "ok-key-01", expectedVersion: -1 },
    { amountCents: 100, idempotencyKey: "ok-key-02", transactionState: "AGREED" },
    { amountCents: 100, idempotencyKey: "ok-key-03", sellerId: "s" },
    { amountCents: 100, idempotencyKey: "ok-key-04", createdByUserId: "c" },
    { amountCents: 100, idempotencyKey: "ok-key-05", price: 10 },
    { amountCents: 100, idempotencyKey: "ok-key-06", amountEur: 1 },
  ];
  for (const [i, body] of malformed.entries()) {
    it(`malformed create #${i} rejected`, () => {
      assert.throws(() => CreateOfferBodySchema.parse(body));
    });
  }
});
