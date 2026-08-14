/**
 * Stage 11F.3 — Stripe signed webhooks HTTP.
 * Mounted with express.raw() BEFORE global express.json() in index.ts.
 */

import type { Request, Response } from "express";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createStripeWebhookProcessor,
  STRIPE_WEBHOOKS_VERSION,
  StripeWebhookConfigError,
  StripeWebhookSignatureError,
} from "../payments/stripe/webhooks/index.js";

export async function handleVautoStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({
        error: "raw_body_required",
        message: "Expected raw application/json body",
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      });
      return;
    }

    const processor = createStripeWebhookProcessor({
      db: createPoolTxQueryable(),
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      requireLivemode: process.env.NODE_ENV === "production",
    });

    const result = await processor.handleRawWebhook({
      rawBody,
      signatureHeader: req.headers["stripe-signature"],
    });

    res.status(200).json(result);
  } catch (e) {
    if (e instanceof StripeWebhookSignatureError) {
      res.status(400).json({
        error: e.code,
        message: e.message,
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      });
      return;
    }
    if (e instanceof StripeWebhookConfigError) {
      res.status(503).json({
        error: e.code,
        message: e.message,
        stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
      });
      return;
    }
    console.error("[webhooks/stripe]", e instanceof Error ? e.message : e);
    res.status(500).json({
      error: "webhook_processing_failed",
      stripeWebhooksVersion: STRIPE_WEBHOOKS_VERSION,
    });
  }
}
