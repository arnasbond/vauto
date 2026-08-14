/**
 * Stage 11D — Negotiation Copilot HTTP (read-only + requireAuth).
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { negotiationCopilotRateLimiter } from "../middleware/rate-limit.js";
import { sendInternalError } from "../lib/http-errors.js";
import {
  createNegotiationCopilotService,
  CopilotAuthError,
  CopilotNotFoundError,
  CopilotVersionConflictError,
  CopilotValidationError,
  NEGOTIATION_COPILOT_VERSION,
} from "../negotiation-copilot/index.js";
import { createPoolTxQueryable } from "../transaction/index.js";

export const negotiationCopilotRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError || e instanceof CopilotValidationError) {
    res.status(400).json({
      error: "validation_error",
      message: e instanceof Error ? e.message : "invalid",
      copilotVersion: NEGOTIATION_COPILOT_VERSION,
    });
    return true;
  }
  // M-02: IDOR + missing → identical 404
  if (e instanceof CopilotNotFoundError || e instanceof CopilotAuthError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof CopilotVersionConflictError) {
    res.status(409).json({ error: e.code, message: e.message });
    return true;
  }
  return false;
}

negotiationCopilotRouter.post(
  "/transactions/:id/copilot/recommend",
  requireAuth,
  negotiationCopilotRateLimiter,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createNegotiationCopilotService(createPoolTxQueryable());
      const recommendation = await svc.recommend({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      res.json(recommendation);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

negotiationCopilotRouter.post(
  "/transactions/:id/copilot/draft-message",
  requireAuth,
  negotiationCopilotRateLimiter,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createNegotiationCopilotService(createPoolTxQueryable());
      const draft = await svc.draftMessage({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      res.json(draft);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
