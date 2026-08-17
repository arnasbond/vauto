/**
 * Stage 11B — Structured Offers HTTP API (thin controllers + requireAuth).
 * Clients never set status / buyerId / sellerId / transactionState.
 */

import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import {
  createOfferEngine,
  OfferAuthError,
  OfferNotFoundError,
  OfferStateError,
  OfferVersionConflictError,
  ListingSaleConflictError,
  OfferIdempotencyConflictError,
  CreateOfferBodySchema,
  CounterOfferBodySchema,
  OfferActionBodySchema,
  STRUCTURED_OFFERS_VERSION,
} from "../transaction/offers/index.js";
import {
  InvalidTransitionError,
  VersionConflictError,
  createPoolTxQueryable,
} from "../transaction/index.js";
import { ZodError } from "zod";
import { createUniversalDealRoomService } from "../marketplace/universal-deal-room-service.js";
import { mapUniversalDealError } from "../marketplace/universal-deal-http.js";

export const offersRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      offersVersion: STRUCTURED_OFFERS_VERSION,
    });
    return true;
  }
  // M-02: IDOR + missing → identical 404 (no existence leak)
  if (e instanceof OfferAuthError || e instanceof OfferNotFoundError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof OfferStateError || e instanceof InvalidTransitionError) {
    res.status(422).json({ error: e instanceof OfferStateError ? e.code : e.code, message: e.message });
    return true;
  }
  if (
    e instanceof OfferVersionConflictError ||
    e instanceof ListingSaleConflictError ||
    e instanceof OfferIdempotencyConflictError ||
    e instanceof VersionConflictError
  ) {
    res.status(409).json({
      error: "code" in e ? (e as { code: string }).code : "CONFLICT",
      message: e.message,
    });
    return true;
  }
  return false;
}

offersRouter.post(
  "/transactions/:id/offers",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = CreateOfferBodySchema.parse(req.body);
      const claimed = req.body as { verticalId?: unknown; vertical?: unknown };
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.createOffer({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        idempotencyKey: body.idempotencyKey,
        clientVertical: claimed.verticalId ?? claimed.vertical,
      });
      res.status(result.idempotentReplay ? 200 : 201).json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        offersVersion: STRUCTURED_OFFERS_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

offersRouter.get(
  "/transactions/:id/offers",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const engine = createOfferEngine(createPoolTxQueryable());
      const offers = await engine.list(req.params.id, req.authUserId!);
      res.json({ offers, offersVersion: STRUCTURED_OFFERS_VERSION });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

offersRouter.post(
  "/offers/:id/accept",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = OfferActionBodySchema.parse(req.body);
      const claimed = req.body as { verticalId?: unknown; vertical?: unknown };
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.acceptOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
        clientVertical: claimed.verticalId ?? claimed.vertical,
      });
      res.json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        offersVersion: STRUCTURED_OFFERS_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

offersRouter.post(
  "/offers/:id/reject",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = OfferActionBodySchema.parse(req.body);
      const claimed = req.body as { verticalId?: unknown; vertical?: unknown };
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.rejectOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
        clientVertical: claimed.verticalId ?? claimed.vertical,
      });
      res.json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        offersVersion: STRUCTURED_OFFERS_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

offersRouter.post(
  "/offers/:id/counter",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = CounterOfferBodySchema.parse(req.body);
      const claimed = req.body as { verticalId?: unknown; vertical?: unknown };
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.counterOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
        clientVertical: claimed.verticalId ?? claimed.vertical,
      });
      res.status(result.idempotentReplay ? 200 : 201).json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        offersVersion: STRUCTURED_OFFERS_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

offersRouter.post(
  "/offers/:id/withdraw",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = OfferActionBodySchema.parse(req.body);
      const claimed = req.body as { verticalId?: unknown; vertical?: unknown };
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.withdrawOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
        clientVertical: claimed.verticalId ?? claimed.vertical,
      });
      res.json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        offersVersion: STRUCTURED_OFFERS_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e) || mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
