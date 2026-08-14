/**
 * Stage 11G.1 — Zod strict schemas for delivery HTTP bodies / responses.
 */

import { z } from "zod";
import { DELIVERY_INTEGRATION_VERSION } from "./version.js";
import { DELIVERY_CARRIERS, DELIVERY_STATUSES } from "./types.js";

export const CreateDeliveryLabelBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    carrier: z.enum(DELIVERY_CARRIERS),
    terminalId: z.string().min(1).max(120).nullable().optional(),
    shippingFeeCents: z.number().int().nonnegative().optional(),
    trackingCode: z.string().min(4).max(120).nullable().optional(),
  })
  .strict();

export const ConfirmDeliveryBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const SyncCarrierStatusBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const DeliveryResponseSchema = z
  .object({
    delivery: z
      .object({
        id: z.string().min(1),
        transactionId: z.string().min(1),
        carrier: z.enum(DELIVERY_CARRIERS),
        trackingCode: z.string().min(1),
        terminalId: z.string().nullable(),
        shippingFeeCents: z.number().int().nonnegative(),
        status: z.enum(DELIVERY_STATUSES),
        carrierLabelId: z.string().nullable(),
        trackingUrl: z.string().nullable(),
        deliveryIntegrationVersion: z.literal(DELIVERY_INTEGRATION_VERSION),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
      })
      .strict(),
    transactionStatus: z.string().min(1),
    transactionVersion: z.number().int().nonnegative(),
    releaseTriggered: z.boolean(),
    releaseTransferStatus: z.string().nullable(),
    messageLt: z.string().nullable(),
    idempotentReplay: z.boolean(),
    deliveryIntegrationVersion: z.literal(DELIVERY_INTEGRATION_VERSION),
  })
  .strict();
