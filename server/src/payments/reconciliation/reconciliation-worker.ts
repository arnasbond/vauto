/**
 * Bounded scheduled reconciliation worker (pagination + status filter).
 */

import type { TxQueryable } from "../../transaction/repository.js";
import {
  reconcileBatch,
  type ProviderLookup,
} from "./reconciler.js";
import type { RepairPort } from "./repair-policy.js";
import type { ReconciliationReport } from "./types.js";
import { PAYMENT_RECONCILIATION_VERSION } from "./version.js";

export type ReconciliationWorkerOptions = {
  db: TxQueryable;
  batchSize?: number;
  maxPages?: number;
  statuses?: string[];
  provider?: ProviderLookup | null;
  repairPort?: RepairPort | null;
};

/**
 * Walk payment intents in bounded pages. Stops after maxPages or empty page.
 */
export async function runBoundedReconciliationWorker(
  opts: ReconciliationWorkerOptions
): Promise<{
  paymentReconciliationVersion: typeof PAYMENT_RECONCILIATION_VERSION;
  pages: number;
  reports: ReconciliationReport[];
  totals: {
    scanned: number;
    inSync: number;
    manualReviewRequired: number;
    securityMismatches: number;
    autoRepairsApplied: number;
  };
}> {
  const batchSize = Math.min(opts.batchSize ?? 50, 200);
  const maxPages = Math.min(opts.maxPages ?? 20, 100);
  const reports: ReconciliationReport[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < maxPages) {
    const report = await reconcileBatch(opts.db, {
      limit: batchSize,
      offset,
      statuses: opts.statuses,
      provider: opts.provider,
      repairPort: opts.repairPort,
    });
    reports.push(report);
    pages += 1;
    if (report.scanned === 0) break;
    offset += report.scanned;
    if (report.scanned < batchSize) break;
  }

  const totals = {
    scanned: reports.reduce((a, r) => a + r.scanned, 0),
    inSync: reports.reduce((a, r) => a + r.inSync, 0),
    manualReviewRequired: reports.reduce(
      (a, r) => a + r.manualReviewRequired,
      0
    ),
    securityMismatches: reports.reduce((a, r) => a + r.securityMismatches, 0),
    autoRepairsApplied: reports.reduce(
      (a, r) => a + r.autoRepairsApplied.length,
      0
    ),
  };

  return {
    paymentReconciliationVersion: PAYMENT_RECONCILIATION_VERSION,
    pages,
    reports,
    totals,
  };
}
