/**
 * Stage 13C — Universal Deal Room HTTP.
 * Actor identity from auth context only. Client vertical is ignored.
 */

import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import { createUniversalDealRoomService } from "../marketplace/universal-deal-room-service.js";
import { mapUniversalDealError } from "../marketplace/universal-deal-http.js";
import { UNIVERSAL_DEAL_ROOM_VERSION } from "../shared/marketplace-domain/deal-actions.js";

export const universalDealRoomRouter = Router();

universalDealRoomRouter.get(
  "/transactions/:id/universal-deal",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const room = await svc.getSnapshot({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        clientVertical: (req.body as { verticalId?: unknown } | undefined)?.verticalId,
      });
      res.json(room);
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

universalDealRoomRouter.post(
  "/transactions/:id/universal-deal/offers",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.createOffer({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        idempotencyKey: String(body.idempotencyKey ?? ""),
        clientVertical: body.verticalId ?? body.vertical,
      });
      res.status(result.idempotentReplay ? 200 : 201).json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

universalDealRoomRouter.post(
  "/offers/:id/universal-deal/counter",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.counterOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        amountCents: body.amountCents,
        currency: body.currency,
        idempotencyKey: String(body.idempotencyKey ?? ""),
        expectedVersion: Number(body.expectedVersion),
        clientVertical: body.verticalId ?? body.vertical,
      });
      res.status(result.idempotentReplay ? 200 : 201).json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

universalDealRoomRouter.post(
  "/offers/:id/universal-deal/accept",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.acceptOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: String(body.idempotencyKey ?? ""),
        expectedVersion: Number(body.expectedVersion),
        clientVertical: body.verticalId ?? body.vertical,
      });
      res.json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

universalDealRoomRouter.post(
  "/offers/:id/universal-deal/reject",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.rejectOffer({
        offerId: req.params.id,
        actorUserId: req.authUserId!,
        idempotencyKey: String(body.idempotencyKey ?? ""),
        expectedVersion: Number(body.expectedVersion),
        clientVertical: body.verticalId ?? body.vertical,
      });
      res.json({
        offer: result.offer,
        transaction: {
          id: result.transaction.id,
          status: result.transaction.status,
          version: result.transaction.version,
        },
        idempotentReplay: result.idempotentReplay,
        universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

universalDealRoomRouter.post(
  "/transactions/:id/universal-deal/payment",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const svc = createUniversalDealRoomService(createPoolTxQueryable());
      const result = await svc.initiatePayment({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: {
          idempotencyKey: body.idempotencyKey,
        },
        clientVertical: body.verticalId ?? body.vertical,
      });
      res.status(result.idempotentReplay ? 200 : 201).json({
        ...result,
        amountCents: result.paymentIntent.amountCents,
        universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      });
    } catch (e) {
      if (mapUniversalDealError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
