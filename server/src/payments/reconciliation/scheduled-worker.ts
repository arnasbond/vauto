/**
 * Stage 11F.6 — Bounded scheduled reconciliation worker starter (M-01).
 */

import {
  createPoolTxQueryable,
  type TxQueryable,
} from "../../transaction/index.js";
import { runBoundedReconciliationWorker } from "./reconciliation-worker.js";
import {
  createDbRepairPort,
  createProductionProviderLookup,
} from "./stripe-provider-lookup.js";

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic bounded reconciliation against live Stripe (when configured).
 * Safe to call once at boot; subsequent calls are no-ops.
 */
export function startScheduledReconciliationWorker(
  intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 60_000)
): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const db = createPoolTxQueryable() as unknown as TxQueryable;
      const provider = createProductionProviderLookup();
      await runBoundedReconciliationWorker({
        db,
        batchSize: Math.min(
          Number(process.env.RECONCILIATION_BATCH_SIZE ?? 50) || 50,
          200
        ),
        maxPages: Math.min(
          Number(process.env.RECONCILIATION_MAX_PAGES ?? 5) || 5,
          20
        ),
        provider,
        repairPort: createDbRepairPort(db),
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`[reconciliation-worker] tick failed: ${detail}`);
    }
  };

  const delay = Math.min(Math.max(intervalMs, 15_000), 300_000);
  setTimeout(() => {
    void tick();
    timer = setInterval(() => void tick(), delay);
    if (timer && typeof timer === "object" && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
  }, Math.min(10_000, delay));
}

export function stopScheduledReconciliationWorkerForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
