/**
 * Soft-launch P0 — real-money hard-disable invariant.
 *
 * Proves the canonical `disableCheckout` kill-switch covers EVERY active
 * money-initiation HTTP route (including the Universal Deal Room payment path)
 * and that it FAILS CLOSED when the checkout safety state cannot be read.
 *
 * For every blocked endpoint we assert BOTH:
 *   A. the expected 503/checkout_disabled rejection, AND
 *   B. the downstream financial service method was called ZERO times
 *      (explicit mock.fn spy, not inferred from the status code).
 *
 * No real Stripe call, no DB write — the provider/service path is never
 * exercised because the guard fires first.
 */

import assert from "node:assert/strict";
import { describe, it, mock, beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";

// Tri-state checkout control: false | true | null (null = read failure).
let checkoutState: boolean | null = false;

const serviceSpies = {
  initiatePayment: mock.fn(async () => ({
    paymentIntent: { amountCents: 0 },
    idempotentReplay: false,
  })),
  createStripePaymentIntent: mock.fn(async () => ({
    paymentIntent: { amountCents: 0 },
    idempotentReplay: false,
  })),
  releaseToSeller: mock.fn(async () => ({
    transferStatus: "COMPLETED",
    idempotentReplay: false,
  })),
  refundToBuyer: mock.fn(async () => ({ idempotentReplay: false })),
};

// Register platform-settings + service-factory mocks BEFORE the routers are
// dynamically imported, so the guard reads the mocked flags and the routes use
// the mocked (spied) services.
mock.module("../../platform/platform-settings.js", {
  namedExports: {
    getPlatformFlags: async () => ({
      maintenanceMode: false,
      disableNewListings: false,
      disableCheckout: checkoutState === true,
    }),
    getCheckoutDisabledFlag: async () => checkoutState,
    PLATFORM_MAINTENANCE_MESSAGE:
      "Platforma laikinai techninėje priežiūroje. Bandykite vėliau.",
    PLATFORM_LISTINGS_DISABLED_MESSAGE:
      "Naujų skelbimų kūrimas laikinai išjungtas.",
    PLATFORM_CHECKOUT_DISABLED_MESSAGE:
      "Mokėjimai laikinai išjungti. Bandykite vėliau.",
  },
});

mock.module("../../marketplace/universal-deal-room-service.js", {
  namedExports: {
    createUniversalDealRoomService: () => ({
      initiatePayment: serviceSpies.initiatePayment,
      createStripePaymentIntent: serviceSpies.createStripePaymentIntent,
    }),
  },
});

mock.module("../../payments/transfer/index.js", {
  namedExports: {
    createFundsTransferService: () => ({
      releaseToSeller: serviceSpies.releaseToSeller,
      refundToBuyer: serviceSpies.refundToBuyer,
    }),
    FUNDS_TRANSFER_VERSION: "test",
    FundsTransferAuthError: class extends Error {},
    FundsTransferForbiddenError: class extends Error {},
    FundsTransferStateError: class extends Error {},
    TransferBlockedError: class extends Error {},
  },
});

const { paymentIntentRouter } = await import("../payment-intent.js");
const { fundsTransferRouter } = await import("../funds-transfer.js");
const { universalDealRoomRouter } = await import("../universal-deal-room.js");
const { apiRouter } = await import("../api.js");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api", paymentIntentRouter);
  app.use("/api", fundsTransferRouter);
  app.use("/api", universalDealRoomRouter);
  return app;
}

const app = createApp();
const buyer = signAccessToken({ sub: "soft-launch-buyer", role: "private" });

function createHealthApp() {
  const healthApp = express();
  healthApp.use("/api", apiRouter);
  return healthApp;
}
const healthApp = createHealthApp();

const MONEY_ENDPOINTS = [
  {
    name: "payment-intent",
    method: "post" as const,
    path: "/api/transactions/tx-softlaunch/payment-intent",
    spy: serviceSpies.initiatePayment,
  },
  {
    name: "stripe-intent",
    method: "post" as const,
    path: "/api/transactions/tx-softlaunch/payment-intent/stripe-intent",
    spy: serviceSpies.createStripePaymentIntent,
  },
  {
    name: "release-to-seller",
    method: "post" as const,
    path: "/api/transactions/tx-softlaunch/payment/release-to-seller",
    spy: serviceSpies.releaseToSeller,
  },
  {
    name: "refund-to-buyer",
    method: "post" as const,
    path: "/api/transactions/tx-softlaunch/payment/refund-to-buyer",
    spy: serviceSpies.refundToBuyer,
  },
  {
    name: "universal-deal/payment",
    method: "post" as const,
    path: "/api/transactions/tx-softlaunch/universal-deal/payment",
    spy: serviceSpies.initiatePayment,
  },
];

beforeEach(() => {
  for (const spy of Object.values(serviceSpies)) spy.mock.resetCalls();
});

describe("Soft-launch P0 — real-money hard-disable kill-switch", () => {
  for (const endpoint of MONEY_ENDPOINTS) {
    it(`${endpoint.name} is rejected (503/checkout_disabled) and the financial service is NOT called when checkout disabled`, async () => {
      checkoutState = true;
      const res = await request(app)
        [endpoint.method](endpoint.path)
        .set("Authorization", `Bearer ${buyer}`)
        .send({ idempotencyKey: `soft-launch-${endpoint.name}-1` });
      assert.equal(res.status, 503);
      assert.equal(res.body.code, "checkout_disabled");
      assert.equal(
        endpoint.spy.mock.callCount(),
        0,
        `${endpoint.name} financial service must not be invoked while checkout is disabled`
      );
    });

    it(`${endpoint.name} guard passes when checkout is NOT disabled (no checkout_disabled 503)`, async () => {
      checkoutState = false;
      const res = await request(app)
        [endpoint.method](endpoint.path)
        .set("Authorization", `Bearer ${buyer}`)
        .send({ idempotencyKey: `soft-launch-${endpoint.name}-open-1` });
      assert.notEqual(res.status, 503);
      assert.notEqual(res.body?.code, "checkout_disabled");
    });
  }

  it("fails CLOSED: unreadable checkout state blocks money initiation (503) and the service is NOT called", async () => {
    checkoutState = null;
    const res = await request(app)
      .post("/api/transactions/tx-softlaunch/payment-intent")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ idempotencyKey: "soft-launch-fail-closed-1" });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "checkout_disabled");
    assert.equal(serviceSpies.initiatePayment.mock.callCount(), 0);
  });

  it("read-only payment-intent GET is not blocked by the kill-switch", async () => {
    checkoutState = true;
    const res = await request(app)
      .get("/api/transactions/tx-softlaunch/payment-intent")
      .set("Authorization", `Bearer ${buyer}`);
    assert.notEqual(res.status, 503);
  });

  it("health reports disableCheckout=null + checkoutStateKnown=false when checkout state is UNKNOWN", async () => {
    checkoutState = null;
    const res = await request(healthApp).get("/api/health");
    assert.equal(res.body.infra.disableCheckout, null);
    assert.equal(res.body.infra.checkoutStateKnown, false);
  });

  it("health reports disableCheckout=true + checkoutStateKnown=true when checkout is disabled", async () => {
    checkoutState = true;
    const res = await request(healthApp).get("/api/health");
    assert.equal(res.body.infra.disableCheckout, true);
    assert.equal(res.body.infra.checkoutStateKnown, true);
  });

  it("health reports disableCheckout=false + checkoutStateKnown=true when checkout is enabled", async () => {
    checkoutState = false;
    const res = await request(healthApp).get("/api/health");
    assert.equal(res.body.infra.disableCheckout, false);
    assert.equal(res.body.infra.checkoutStateKnown, true);
  });
});
