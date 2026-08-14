/**
 * Stage 11H.1 — Dispute HTTP (thin controllers + requireAuth / requireAdmin).
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  requireAuth,
  requireAdmin,
  userIsAdmin,
} from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createDisputeService,
  createDisputeFundsPort,
  DISPUTE_ENGINE_VERSION,
  DisputeAuthError,
  DisputeAdminRequiredError,
  DisputeNotFoundError,
  DisputeStateError,
  DisputeResponseSchema,
} from "../disputes/index.js";

export const disputeRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      disputeEngineVersion: DISPUTE_ENGINE_VERSION,
    });
    return true;
  }
  if (e instanceof DisputeAdminRequiredError) {
    res.status(403).json({
      error: e.code,
      message: e.message,
      disputeEngineVersion: DISPUTE_ENGINE_VERSION,
    });
    return true;
  }
  if (e instanceof DisputeAuthError || e instanceof DisputeNotFoundError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof DisputeStateError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      disputeEngineVersion: DISPUTE_ENGINE_VERSION,
    });
    return true;
  }
  return false;
}

function svc() {
  const db = createPoolTxQueryable() as unknown as import("../transaction/index.js").TxQueryable;
  return createDisputeService(db, {
    fundsPort: createDisputeFundsPort(db),
  });
}

disputeRouter.post(
  "/transactions/:id/disputes/open",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().openDispute({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      DisputeResponseSchema.parse(result);
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

disputeRouter.get(
  "/transactions/:id/disputes",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const admin = await userIsAdmin(req);
      const result = await svc().getDispute({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        isAdmin: admin,
      });
      DisputeResponseSchema.parse(result);
      res.json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

disputeRouter.post(
  "/admin/transactions/:id/disputes/resolve",
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const result = await svc().resolveDispute({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
        authority: "ADMIN",
      });
      DisputeResponseSchema.parse(result);
      res.status(result.idempotentReplay ? 200 : 200).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
