/**
 * Stage 11I.1 — Reputation HTTP (thin controllers + requireAuth on write).
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createReputationService,
  REPUTATION_ENGINE_VERSION,
  ReputationConflictError,
  ReputationForbiddenError,
  ReputationNotFoundError,
  ReviewSubmitResponseSchema,
  UserReputationResponseSchema,
} from "../reputation/index.js";

export const reputationRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      reputationEngineVersion: REPUTATION_ENGINE_VERSION,
    });
    return true;
  }
  if (e instanceof ReputationForbiddenError) {
    res.status(403).json({
      error: e.code,
      message: e.message,
      reputationEngineVersion: REPUTATION_ENGINE_VERSION,
    });
    return true;
  }
  if (e instanceof ReputationConflictError) {
    res.status(409).json({
      error: e.code,
      message: e.message,
      reputationEngineVersion: REPUTATION_ENGINE_VERSION,
    });
    return true;
  }
  if (e instanceof ReputationNotFoundError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  return false;
}

function svc() {
  const db = createPoolTxQueryable() as unknown as import("../transaction/index.js").TxQueryable;
  return createReputationService(db);
}

reputationRouter.get(
  "/transactions/:id/reviews",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().listTransactionReviews({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
      });
      res.json({
        reviews: result.reviews,
        reputationEngineVersion: REPUTATION_ENGINE_VERSION,
      });
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

reputationRouter.post(
  "/transactions/:id/reviews",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().submitReview({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      ReviewSubmitResponseSchema.parse(result);
      res.status(201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

reputationRouter.get(
  "/users/:id/reputation",
  async (req, res) => {
    try {
      const result = await svc().getUserReputation(req.params.id);
      UserReputationResponseSchema.parse(result);
      res.json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
