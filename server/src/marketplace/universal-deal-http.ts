import type { Response } from "express";
import { ZodError } from "zod";
import {
  DealCapabilityDeniedError,
  DealMoneyError,
  DealNegotiationStateError,
} from "../shared/marketplace-domain/deal-actions.js";
import {
  OfferAuthError,
  OfferNotFoundError,
  OfferStateError,
  OfferVersionConflictError,
  ListingSaleConflictError,
  OfferIdempotencyConflictError,
} from "../transaction/offers/index.js";
import {
  InvalidTransitionError,
  VersionConflictError,
} from "../transaction/index.js";
import {
  FinancialReconciliationError,
  PaymentAuthError,
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
  PaymentStateError,
  PaymentVersionConflictError,
} from "../payment/index.js";
import { DealNotFoundError, DealPaymentStateError } from "./deal-authority.js";
import { UNIVERSAL_DEAL_ROOM_VERSION } from "../shared/marketplace-domain/deal-actions.js";

export function mapUniversalDealError(res: Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: e.flatten(),
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (e instanceof DealMoneyError) {
    res.status(400).json({
      error: e.code,
      message: e.message,
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (e instanceof DealCapabilityDeniedError) {
    res.status(403).json({
      error: e.code,
      message: e.message,
      action: e.action,
      verticalId: e.verticalId,
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (
    e instanceof DealNotFoundError ||
    e instanceof OfferAuthError ||
    e instanceof OfferNotFoundError ||
    e instanceof PaymentAuthError ||
    e instanceof PaymentNotFoundError
  ) {
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof DealPaymentStateError) {
    res.status(422).json({
      error: e.code,
      message: e.message,
      transactionStatus: e.transactionStatus,
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (e instanceof DealNegotiationStateError || e instanceof OfferStateError) {
    res.status(422).json({
      error: e instanceof DealNegotiationStateError ? e.code : e.code,
      message: e.message,
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (e instanceof InvalidTransitionError) {
    res.status(422).json({ error: e.code, message: e.message });
    return true;
  }
  if (e instanceof FinancialReconciliationError) {
    res.status(422).json({
      error: e.code,
      message: "Unprocessable Financial Entity",
    });
    return true;
  }
  if (e instanceof PaymentStateError) {
    res.status(422).json({ error: e.code, message: e.message });
    return true;
  }
  if (
    e instanceof OfferVersionConflictError ||
    e instanceof ListingSaleConflictError ||
    e instanceof OfferIdempotencyConflictError ||
    e instanceof VersionConflictError ||
    e instanceof PaymentIdempotencyConflictError ||
    e instanceof PaymentVersionConflictError
  ) {
    res.status(409).json({
      error: "code" in e ? (e as { code: string }).code : "CONFLICT",
      message: e.message,
    });
    return true;
  }
  return false;
}
