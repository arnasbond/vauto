/**
 * Stage 11F.1 / 11F.2 — Payment Intent HTTP (thin controller + requireAuth).
 * Client may send ONLY idempotencyKey. Amount/currency from snapshot.
 * Stripe create uses 2-phase TX (network outside DB TX). No webhooks / mark-paid.
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createPaymentIntentService,
  FinancialReconciliationError,
  PAYMENT_LEDGER_VERSION,
  PaymentAuthError,
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
  PaymentStateError,
  PaymentVersionConflictError,
} from "../payment/index.js";
import {
  createStripePaymentIntentService,
  STRIPE_INTEGRATION_VERSION,
  StripeProviderError,
  StripeProviderTimeoutError,
} from "../payments/stripe/index.js";

export const paymentIntentRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    });
    return true;
  }
  if (e instanceof PaymentAuthError || e instanceof PaymentNotFoundError) {
    // IDOR: identical 404
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof FinancialReconciliationError) {
    res.status(422).json({
      error: e.code,
      message: "Unprocessable Financial Entity",
      snapshotAmountCents: e.snapshotAmountCents,
      offerAmountCents: e.offerAmountCents,
      paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    });
    return true;
  }
  if (e instanceof PaymentStateError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    });
    return true;
  }
  if (
    e instanceof PaymentIdempotencyConflictError ||
    e instanceof PaymentVersionConflictError
  ) {
    res.status(409).json({
      error: e.code,
      message: e.message,
      paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    });
    return true;
  }
  if (e instanceof StripeProviderTimeoutError) {
    res.status(504).json({
      error: e.code,
      message: e.message,
      stripeIntegrationVersion: STRIPE_INTEGRATION_VERSION,
    });
    return true;
  }
  if (e instanceof StripeProviderError) {
    res.status(e.httpStatus).json({
      error: e.code,
      message: e.message,
      stripeIntegrationVersion: STRIPE_INTEGRATION_VERSION,
    });
    return true;
  }
  return false;
}

paymentIntentRouter.post(
  "/transactions/:id/payment-intent",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createPaymentIntentService(createPoolTxQueryable());
      const result = await svc.createPaymentIntent({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

paymentIntentRouter.get(
  "/transactions/:id/payment-intent",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createPaymentIntentService(createPoolTxQueryable());
      const result = await svc.getPaymentIntent({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
      });
      res.json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

/** Stage 11F.2 — Stripe PaymentIntent create/reuse (2-phase). */
paymentIntentRouter.post(
  "/transactions/:id/payment-intent/stripe-intent",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createStripePaymentIntentService(createPoolTxQueryable());
      const result = await svc.createStripePaymentIntent({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
