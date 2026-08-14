/**
 * Stage 11F.4 / 11F.6 — Funds release / refund HTTP (thin controllers).
 * Client may send ONLY idempotencyKey. Amounts & destination are server-derived.
 * C-02: refund-to-buyer requires admin (buyer self-refund → 403).
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth, userIsAdmin } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import {
  createFundsTransferService,
  FUNDS_TRANSFER_VERSION,
  FundsTransferAuthError,
  FundsTransferForbiddenError,
  FundsTransferStateError,
  TransferBlockedError,
} from "../payments/transfer/index.js";
import {
  StripeProviderError,
  StripeProviderTimeoutError,
} from "../payments/stripe/index.js";

export const fundsTransferRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  if (e instanceof FundsTransferForbiddenError) {
    res.status(403).json({
      error: e.code,
      message: e.message,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  if (e instanceof FundsTransferAuthError) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof TransferBlockedError) {
    res.status(422).json({
      error: e.code,
      message: e.messageLt,
      messageLt: e.messageLt,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  if (e instanceof FundsTransferStateError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  if (e instanceof StripeProviderTimeoutError) {
    res.status(504).json({
      error: e.code,
      message: e.message,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  if (e instanceof StripeProviderError) {
    res.status(e.httpStatus).json({
      error: e.code,
      message: e.message,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    });
    return true;
  }
  return false;
}

fundsTransferRouter.post(
  "/transactions/:id/payment/release-to-seller",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createFundsTransferService(createPoolTxQueryable());
      const result = await svc.releaseToSeller({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
      });
      if (result.transferStatus === "TRANSFER_BLOCKED") {
        res.status(422).json({
          ...result,
          error: "TRANSFER_BLOCKED",
          message: result.messageLt,
        });
        return;
      }
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);

fundsTransferRouter.post(
  "/transactions/:id/payment/refund-to-buyer",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      // C-02: buyer/seller self-serve refund forbidden — admin only on HTTP
      if (!(await userIsAdmin(req))) {
        res.status(403).json({
          error: "REFUND_FORBIDDEN",
          message:
            "Buyer cannot initiate refund; admin/system/dispute only",
          fundsTransferVersion: FUNDS_TRANSFER_VERSION,
        });
        return;
      }
      const svc = createFundsTransferService(createPoolTxQueryable());
      const result = await svc.refundToBuyer({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        body: req.body,
        authority: "ADMIN",
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
