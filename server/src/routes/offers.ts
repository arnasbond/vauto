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
      const engine = createOfferEngine(createPoolTxQueryable());
      const result = await engine.create({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        expiresAt: body.expiresAt,
        idempotencyKey: body.idempotencyKey,
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
      if (mapError(res, e)) return;
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
      if (mapError(res, e)) return;
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
      const engine = createOfferEngine(createPoolTxQueryable());
      const result = await engine.accept({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
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
      if (mapError(res, e)) return;
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
      const engine = createOfferEngine(createPoolTxQueryable());
      const result = await engine.reject({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
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
      if (mapError(res, e)) return;
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
      const engine = createOfferEngine(createPoolTxQueryable());
      const result = await engine.counter({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        expiresAt: body.expiresAt,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
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
      if (mapError(res, e)) return;
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
      const engine = createOfferEngine(createPoolTxQueryable());
      const result = await engine.withdraw({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: body.idempotencyKey,
        expectedVersion: body.expectedVersion,
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
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
