/**
 * Stage 11G — Delivery HTTP (thin controllers + requireAuth).
 * 11G.2: 409/403 release blocks, 503 fail-closed carrier.
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createDeliveryService,
  createFundsReleasePort,
  DELIVERY_INTEGRATION_VERSION,
  DeliveryAuthError,
  DeliveryCarrierUnavailableError,
  DeliveryNotFoundError,
  DeliveryReleaseBlockedError,
  DeliveryStateError,
  DeliveryResponseSchema,
} from "../delivery/index.js";

export const deliveryRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
    });
    return true;
  }
  if (e instanceof DeliveryAuthError || e instanceof DeliveryNotFoundError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof DeliveryReleaseBlockedError) {
    res.status(e.httpStatus).json({
      error: e.code,
      reason: e.reason,
      message: e.message,
      deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
    });
    return true;
  }
  if (e instanceof DeliveryCarrierUnavailableError) {
    res.status(503).json({
      error: e.code,
      message: e.message,
      deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
    });
    return true;
  }
  if (e instanceof DeliveryStateError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
    });
    return true;
  }
  return false;
}

function svc() {
  const db = createPoolTxQueryable() as unknown as import("../transaction/index.js").TxQueryable;
  return createDeliveryService(db, {
    releasePort: createFundsReleasePort(db),
  });
}

deliveryRouter.post(
  "/transactions/:id/delivery/label",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().createLabel({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      DeliveryResponseSchema.parse(result);
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

deliveryRouter.post(
  "/transactions/:id/delivery/confirm",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().confirmDelivery({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      DeliveryResponseSchema.parse(result);
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

deliveryRouter.post(
  "/transactions/:id/delivery/sync-status",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().syncCarrierStatus({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
        authoritySource: "user_poll",
      });
      DeliveryResponseSchema.parse(result);
      res.status(200).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

deliveryRouter.get(
  "/transactions/:id/delivery/tracking",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().getTracking({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
      });
      DeliveryResponseSchema.parse(result);
      res.json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
