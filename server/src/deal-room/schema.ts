/**
 * Deal Room Zod schemas.
 */

import { z } from "zod";
import { DEAL_ROOM_VERSION } from "./version.js";
import { DEAL_ROOM_ALLOWED_ACTIONS } from "./types.js";

export const DealRoomQuerySchema = z
  .object({
    expectedTransactionVersion: z.coerce.number().int().nonnegative().optional(),
    expectedActiveOfferVersion: z.coerce
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    timelineLimit: z.coerce.number().int().min(10).max(20).optional().default(15),
  })
  .strict();

export const ParticipantSummarySchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(["BUYER", "SELLER"]),
    displayName: z.string().min(1),
    avatarUrl: z.string().nullable(),
    verified: z.boolean(),
  })
  .strict();

export const DealRoomResponseSchema = z
  .object({
    dealRoomVersion: z.literal(DEAL_ROOM_VERSION),
    transaction: z
      .object({
        id: z.string(),
        state: z.string(),
        version: z.number().int().nonnegative(),
      })
      .strict(),
    listing: z
      .object({
        id: z.string(),
        title: z.string(),
        thumbnail: z.string().nullable(),
        askingPriceCents: z.number().int().positive().nullable(),
        currency: z.literal("EUR"),
      })
      .strict(),
    buyer: ParticipantSummarySchema,
    seller: ParticipantSummarySchema,
    activeOffer: z
      .object({
        id: z.string(),
        amountCents: z.number().int().positive(),
        createdByRole: z.enum(["BUYER", "SELLER"]),
        status: z.string(),
        expiresAt: z.string().nullable(),
        version: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    agreementSnapshot: z
      .object({
        id: z.string(),
        acceptedOfferId: z.string(),
        amountCents: z.number().int().positive(),
        currency: z.literal("EUR"),
        listingTitle: z.string(),
        listingAttributes: z.record(z.unknown()),
        listingPrimaryImage: z.string().nullable(),
        snapshotHash: z.string().min(16),
        createdAt: z.string(),
      })
      .strict()
      .nullable(),
    transactionSummary: z
      .object({
        paymentStatus: z.literal("NOT_AVAILABLE"),
        shippingStatus: z.literal("NOT_AVAILABLE"),
        protectionStatus: z.literal("NOT_AVAILABLE"),
      })
      .strict(),
    allowedActions: z.array(z.enum(DEAL_ROOM_ALLOWED_ACTIONS)),
    timelinePreview: z.array(
      z
        .object({
          id: z.string(),
          messageType: z.enum(["USER_MESSAGE", "DOMAIN_EVENT"]),
          eventType: z.string().nullable(),
          senderId: z.string().nullable(),
          textSafe: z.string(),
          createdAt: z.string(),
        })
        .strict()
    ),
    transactionVersion: z.number().int().nonnegative(),
    activeOfferVersion: z.number().int().nonnegative().nullable(),
    viewerRole: z.enum(["BUYER", "SELLER"]),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      body.transactionSummary.paymentStatus !== "NOT_AVAILABLE" ||
      body.transactionSummary.shippingStatus !== "NOT_AVAILABLE" ||
      body.transactionSummary.protectionStatus !== "NOT_AVAILABLE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "future_statuses_must_be_NOT_AVAILABLE",
      });
    }
    const forbidden = ["PAY", "SHIP", "CONFIRM_DELIVERY", "RELEASE_ESCROW"];
    for (const a of body.allowedActions) {
      if (forbidden.includes(a)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `forbidden_action_${a}`,
        });
      }
    }
  });
