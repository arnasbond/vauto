/**
 * VAUTO AI Core v2.3R.1 — Arena business metrics (corrected economics).
 *
 * costPerSuccessfulTask = TOTAL incurred cost across ALL requests / successful
 * tasks. Failures/timeouts/retries/verifiers cannot disappear from accounting.
 */
import type { ArenaRecord, ArenaSummary, RequestCost } from "./types.js";

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? null;
}

function flatten(records: ArenaRecord[]): RequestCost[] {
  return records.flatMap((r) => r.cost.requests);
}

function sum(nums: Array<number | null>): number | null {
  const xs = nums.filter((n): n is number => n != null);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0);
}

/** A request whose cost cannot be determined contributes to COST_INCOMPLETE. */
function costUnknown(r: RequestCost): boolean {
  if (r.billed === "unknown") return true;
  if (r.billed === "not_billed") return false;
  return r.usage.cost == null;
}

export function summarizeArena(records: ArenaRecord[]): ArenaSummary {
  const all = flatten(records);
  const success = records.filter((r) => r.outcome === "PASS");
  const attempted = records.length;
  const lat = records.map((r) => r.latencyMs).sort((a, b) => a - b);

  const retries = all.filter((r) => r.role === "retry").length;
  const unknownCostRequestCount = all.filter(costUnknown).length;
  const knownCost = sum(all.map((r) => r.usage.cost));
  const totalTokensKnown = all.every((r) => r.usage.totalTokens != null);
  const totalTokens = sum(all.map((r) => r.usage.totalTokens));

  const costIncomplete = unknownCostRequestCount > 0;
  const costPerRequest = !costIncomplete && knownCost != null ? knownCost / Math.max(1, all.length) : null;
  const costPerSuccessfulTask = !costIncomplete && knownCost != null && success.length > 0 ? knownCost / success.length : null;

  return {
    semanticSuccessRate: attempted ? success.length / attempted : 0,
    contractReliability: attempted ? records.filter((r) => r.structural === "valid").length / attempted : 0,
    authoritySafetyRate: attempted ? records.filter((r) => r.authorityOk).length / attempted : 0,
    timeoutRate: attempted ? records.filter((r) => r.structural === "timeout").length / attempted : 0,
    medianLatencyMs: percentile(lat, 50),
    p95LatencyMs: percentile(lat, 95),
    requestsPerTask: attempted ? all.length / attempted : null,
    retriesPerSuccessfulTask: success.length ? retries / success.length : null,
    tokensPerAttemptedTask: attempted && totalTokensKnown && totalTokens != null ? totalTokens / attempted : null,
    tokensPerSuccessfulTask: success.length && totalTokensKnown && totalTokens != null ? totalTokens / success.length : null,
    knownCost,
    unknownCostRequestCount,
    costIncomplete,
    costPerRequest,
    costPerSuccessfulTask,
    costPer1000SuccessfulTasks: costPerSuccessfulTask != null ? costPerSuccessfulTask * 1000 : null,
  };
}
