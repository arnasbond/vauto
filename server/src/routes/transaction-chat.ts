/**
 * Stage 11C — Transaction Chat HTTP API (thin + requireAuth).
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import {
  createTimelineService,
  ChatAuthError,
  ChatNotFoundError,
  ChatValidationError,
  TRANSACTION_CHAT_VERSION,
} from "../transaction-chat/index.js";
import { createPoolTxQueryable } from "../transaction/index.js";

export const transactionChatRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError || e instanceof ChatValidationError) {
    res.status(400).json({
      error: "validation_error",
      message: e instanceof Error ? e.message : "invalid",
      chatVersion: TRANSACTION_CHAT_VERSION,
    });
    return true;
  }
  // M-02: IDOR + missing → identical 404
  if (e instanceof ChatNotFoundError || e instanceof ChatAuthError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  return false;
}

transactionChatRouter.get(
  "/transactions/:id/timeline",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createTimelineService(createPoolTxQueryable());
      const page = await svc.getTimeline({
        transactionId: req.params.id,
        userId: req.authUserId!,
        query: req.query,
      });
      res.json(page);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

transactionChatRouter.post(
  "/transactions/:id/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createTimelineService(createPoolTxQueryable());
      const result = await svc.postMessage({
        transactionId: req.params.id,
        userId: req.authUserId!,
        body: req.body,
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

transactionChatRouter.post(
  "/transactions/:id/read",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createTimelineService(createPoolTxQueryable());
      const result = await svc.markRead({
        transactionId: req.params.id,
        userId: req.authUserId!,
        body: req.body,
      });
      res.json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
