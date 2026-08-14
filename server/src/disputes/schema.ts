/**
 * Stage 11H.2 — Zod strict schemas for dispute HTTP bodies / responses.
 */

import { z } from "zod";
import { DISPUTE_ENGINE_VERSION } from "./version.js";
import {
  DISPUTE_REASONS,
  DISPUTE_RESOLUTIONS,
  DISPUTE_STATUSES,
} from "./types.js";

export const OpenDisputeBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reason: z.enum(DISPUTE_REASONS),
    description: z.string().min(1).max(4000),
  })
  .strict();

export const ResolveDisputeBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    resolution: z.enum(DISPUTE_RESOLUTIONS),
    resolutionNotes: z.string().min(1).max(4000).optional(),
  })
  .strict();

export const DisputeEvidenceSchema = z
  .object({
    vautoDealSnapshotId: z.string().nullable(),
    trackingCode: z.string().nullable(),
    fullChatCanonicalHash: z.string().nullable(),
    evidenceManifestHash: z.string().nullable(),
    lastChatMessageId: z.string().nullable(),
    lastChatMessageHash: z.string().nullable(),
    fundsFreezeState: z.enum([
      "TRANSFER_BLOCKED",
      "TRANSFER_IN_FLIGHT",
      "TRANSFER_ALREADY_EXECUTED",
      "NONE",
    ]),
    openedAtTransactionStatus: z.string().min(1),
    disputeEngineVersion: z.literal(DISPUTE_ENGINE_VERSION),
  })
  .strict();

export const DisputeResponseSchema = z
  .object({
    dispute: z
      .object({
        id: z.string().min(1),
        transactionId: z.string().min(1),
        openedByUserId: z.string().min(1),
        reason: z.enum(DISPUTE_REASONS),
        description: z.string(),
        evidenceJson: DisputeEvidenceSchema.nullable(),
        status: z.enum(DISPUTE_STATUSES),
        resolutionNotes: z.string().nullable(),
        resolvedByUserId: z.string().nullable(),
        disputeEngineVersion: z.literal(DISPUTE_ENGINE_VERSION),
        createdAt: z.string().min(1),
        resolvedAt: z.string().nullable(),
      })
      .strict(),
    transactionStatus: z.string().min(1),
    transactionVersion: z.number().int().nonnegative(),
    fundsFrozen: z.boolean(),
    transferStatus: z.string().nullable(),
    fundsAction: z
      .enum([
        "NONE",
        "REFUND",
        "RELEASE",
        "FINANCIAL_ACTION_PENDING",
        "MANUAL_REVIEW",
      ])
      .nullable(),
    fundsTransferStatus: z.string().nullable(),
    messageLt: z.string().nullable(),
    idempotentReplay: z.boolean(),
    disputeEngineVersion: z.literal(DISPUTE_ENGINE_VERSION),
  })
  .strict();
