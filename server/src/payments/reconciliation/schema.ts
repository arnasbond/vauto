/**
 * Stage 11F.5 — Zod schemas for reconciliation reports (operator-safe).
 */

import { z } from "zod";
import { PAYMENT_RECONCILIATION_VERSION } from "./version.js";
import { DISCREPANCY_CLASSES, INVARIANT_IDS } from "./types.js";

export const DiscrepancyClassSchema = z.enum(DISCREPANCY_CLASSES);
export const InvariantIdSchema = z.enum(INVARIANT_IDS);

export const DiscrepancyFindingSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    transactionId: z.string().min(1),
    classification: DiscrepancyClassSchema,
    invariantId: InvariantIdSchema.nullable(),
    code: z.string().min(1),
    message: z.string().min(1),
    safeAutoHeal: z.boolean(),
  })
  .strict();

export const AutoRepairActionSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    action: z.string().min(1),
    applied: z.boolean(),
    reason: z.string().min(1),
  })
  .strict();

export const ReconciliationReportSchema = z
  .object({
    paymentReconciliationVersion: z.literal(PAYMENT_RECONCILIATION_VERSION),
    reconciledAt: z.string().min(10),
    scanned: z.number().int().nonnegative(),
    inSync: z.number().int().nonnegative(),
    discrepancies: z.array(DiscrepancyFindingSchema),
    autoRepairsApplied: z.array(AutoRepairActionSchema),
    manualReviewRequired: z.number().int().nonnegative(),
    securityMismatches: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((r, ctx) => {
    // Never allow raw Stripe secrets in report JSON keys/values
    const blob = JSON.stringify(r);
    if (/sk_live|sk_test|whsec_|client_secret/i.test(blob)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "report_must_not_contain_secrets",
      });
    }
  });
