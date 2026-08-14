/**
 * Stage 11F.5 / 11F.6 — Admin financial reconciliation check (operator-safe report).
 * H-02: wires live Stripe provider lookup (never null when STRIPE_SECRET_KEY set).
 */

import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { createPoolTxQueryable } from "../transaction/index.js";
import type { TxQueryable } from "../transaction/index.js";
import {
  PAYMENT_RECONCILIATION_VERSION,
  ReconciliationReportSchema,
  runBoundedReconciliationWorker,
  createProductionProviderLookup,
  createDbRepairPort,
} from "../payments/reconciliation/index.js";

export const reconciliationRouter = Router();

reconciliationRouter.get(
  "/admin/payments/reconciliation-check",
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const limit = Math.min(
        Number(req.query.batchSize ?? 50) || 50,
        200
      );
      const maxPages = Math.min(Number(req.query.maxPages ?? 5) || 5, 20);
      const db = createPoolTxQueryable() as unknown as TxQueryable;
      const provider = createProductionProviderLookup();
      const worker = await runBoundedReconciliationWorker({
        db,
        batchSize: limit,
        maxPages,
        provider,
        repairPort: createDbRepairPort(db),
      });

      const merged = {
        paymentReconciliationVersion: PAYMENT_RECONCILIATION_VERSION,
        reconciledAt: new Date().toISOString(),
        scanned: worker.totals.scanned,
        inSync: worker.totals.inSync,
        discrepancies: worker.reports.flatMap((r) => r.discrepancies),
        autoRepairsApplied: worker.reports.flatMap(
          (r) => r.autoRepairsApplied
        ),
        manualReviewRequired: worker.totals.manualReviewRequired,
        securityMismatches: worker.totals.securityMismatches,
        providerWired: provider != null,
      };
      const safe = ReconciliationReportSchema.parse({
        paymentReconciliationVersion: merged.paymentReconciliationVersion,
        reconciledAt: merged.reconciledAt,
        scanned: merged.scanned,
        inSync: merged.inSync,
        discrepancies: merged.discrepancies,
        autoRepairsApplied: merged.autoRepairsApplied,
        manualReviewRequired: merged.manualReviewRequired,
        securityMismatches: merged.securityMismatches,
      });
      res.json({ ...safe, providerWired: merged.providerWired });
    } catch (e) {
      sendInternalError(res, e);
    }
  }
);
