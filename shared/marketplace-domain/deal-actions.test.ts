import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VERTICAL_CAPABILITIES } from "./capabilities";
import {
  assertDealActionAllowed,
  assertNegotiationAction,
  assertValidOfferMoney,
  capabilitiesForListing,
  DealCapabilityDeniedError,
  DealMoneyError,
  DealNegotiationStateError,
  dealActionsFromCapabilities,
  deriveDealNegotiationState,
  formatDealCentsLt,
  isDealActionAllowed,
  parseEuroInputToCents,
  resolveListingVertical,
  whoseTurn,
} from "./deal-actions";

describe("13C capability → deal actions (no automotive branching)", () => {
  it("TRANSPORT allows offer, negotiation, payment, pickup, appointments", () => {
    const a = dealActionsFromCapabilities(VERTICAL_CAPABILITIES.TRANSPORT);
    assert.ok(a.includes("OFFER"));
    assert.ok(a.includes("COUNTER_OFFER"));
    assert.ok(a.includes("INITIATE_PAYMENT"));
  });

  it("REAL_ESTATE allows offer/negotiation and forbids platform checkout", () => {
    const a = dealActionsFromCapabilities(VERTICAL_CAPABILITIES.REAL_ESTATE);
    assert.ok(a.includes("OFFER"));
    assert.ok(a.includes("COUNTER_OFFER"));
    assert.equal(a.includes("INITIATE_PAYMENT"), false);
    assert.ok(a.includes("APPOINTMENT"));
  });

  it("ELECTRONICS allows offer, payment", () => {
    const a = dealActionsFromCapabilities(VERTICAL_CAPABILITIES.ELECTRONICS);
    assert.ok(a.includes("OFFER"));
    assert.ok(a.includes("INITIATE_PAYMENT"));
  });

  it("JOBS fail-closed: no purchase offer, no payment", () => {
    const a = dealActionsFromCapabilities(VERTICAL_CAPABILITIES.JOBS);
    assert.equal(a.includes("OFFER"), false);
    assert.equal(a.includes("COUNTER_OFFER"), false);
    assert.equal(a.includes("INITIATE_PAYMENT"), false);
    assert.ok(a.includes("APPLICATION"));
    assert.ok(a.includes("CONTACT"));
  });

  it("HOME_GARDEN allows offer, payment", () => {
    const a = dealActionsFromCapabilities(VERTICAL_CAPABILITIES.HOME_GARDEN);
    assert.ok(a.includes("OFFER"));
    assert.ok(a.includes("INITIATE_PAYMENT"));
  });

  it("unknown listing is fail-closed", () => {
    const caps = capabilitiesForListing({ category: "hacked-vertical" });
    const a = dealActionsFromCapabilities(caps);
    assert.equal(a.includes("OFFER"), false);
    assert.equal(a.includes("INITIATE_PAYMENT"), false);
  });
});

describe("13C forged vertical is ignored", () => {
  it("F — listing JOBS + client ELECTRONICS still JOBS", () => {
    const id = resolveListingVertical(
      { category: "jobs", attributes: { _canonicalVertical: "JOBS" } },
      "ELECTRONICS"
    );
    assert.equal(id, "JOBS");
    assert.equal(
      isDealActionAllowed(
        { category: "jobs" },
        "OFFER",
        "ELECTRONICS"
      ),
      false
    );
    assert.throws(
      () =>
        assertDealActionAllowed({ category: "jobs" }, "INITIATE_PAYMENT", "ELECTRONICS"),
      DealCapabilityDeniedError
    );
  });

  it("canonical attribute wins over forged category alias on the same record", () => {
    const id = resolveListingVertical(
      {
        category: "electronics",
        attributes: { _canonicalVertical: "REAL_ESTATE" },
      },
      "ELECTRONICS"
    );
    assert.equal(id, "REAL_ESTATE");
  });
});

describe("13C negotiation SM", () => {
  it("OPEN → OFFERED → COUNTERED → ACCEPTED", () => {
    assert.equal(
      deriveDealNegotiationState({ transactionStatus: "DISCUSSION", offers: [] }),
      "OPEN"
    );
    assert.equal(
      deriveDealNegotiationState({
        transactionStatus: "OFFER_PENDING",
        offers: [{ status: "PENDING", parentOfferId: null }],
      }),
      "OFFERED"
    );
    assert.equal(
      deriveDealNegotiationState({
        transactionStatus: "NEGOTIATING",
        offers: [
          { status: "COUNTERED", parentOfferId: null },
          { status: "PENDING", parentOfferId: "o1" },
        ],
      }),
      "COUNTERED"
    );
    assert.equal(
      deriveDealNegotiationState({
        transactionStatus: "AGREED",
        offers: [{ status: "ACCEPTED", parentOfferId: "o1" }],
      }),
      "ACCEPTED"
    );
  });

  it("payment ledger states stay ACCEPTED in 13C SM (not a second ledger)", () => {
    for (const st of ["PAYMENT_PENDING", "PAID", "SHIPPED", "COMPLETED"]) {
      assert.equal(
        deriveDealNegotiationState({ transactionStatus: st, offers: [] }),
        "ACCEPTED"
      );
    }
  });

  it("I — counter after ACCEPTED is forbidden", () => {
    assert.throws(
      () => assertNegotiationAction("ACCEPTED", "COUNTER_OFFER"),
      DealNegotiationStateError
    );
    assert.throws(
      () => assertNegotiationAction("ACCEPTED", "OFFER"),
      DealNegotiationStateError
    );
  });

  it("whoseTurn: pending buyer offer waits on seller", () => {
    assert.equal(
      whoseTurn({ state: "OFFERED", pendingCreatedByRole: "BUYER" }),
      "SELLER"
    );
    assert.equal(whoseTurn({ state: "OPEN", pendingCreatedByRole: null }), "BUYER");
    assert.equal(whoseTurn({ state: "ACCEPTED", pendingCreatedByRole: null }), "NONE");
  });
});

describe("13C money — integer cents only", () => {
  it("accepts integer cents and EUR", () => {
    assert.deepEqual(assertValidOfferMoney({ amountCents: 50000, currency: "EUR" }), {
      amountCents: 50000,
      currency: "EUR",
    });
  });

  it("rejects floats, zero, strings", () => {
    assert.throws(() => assertValidOfferMoney({ amountCents: 5.5 }), DealMoneyError);
    assert.throws(() => assertValidOfferMoney({ amountCents: 0 }), DealMoneyError);
    assert.throws(() => assertValidOfferMoney({ amountCents: "500" }), DealMoneyError);
    assert.throws(
      () => assertValidOfferMoney({ amountCents: 100, currency: "USD" }),
      DealMoneyError
    );
  });

  it("parseEuroInputToCents does not use floating money", () => {
    assert.equal(parseEuroInputToCents("500"), 50000);
    assert.equal(parseEuroInputToCents("500,50"), 50050);
    assert.equal(parseEuroInputToCents("5 €"), null);
    assert.equal(parseEuroInputToCents("1.5.0"), null);
    assert.equal(parseEuroInputToCents("-1"), null);
  });

  it("formats with space before €", () => {
    assert.equal(formatDealCentsLt(50000), "500 €");
    assert.equal(formatDealCentsLt(10500), "105 €");
    assert.equal(formatDealCentsLt(10501), "105,01 €");
  });
});
