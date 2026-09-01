/**
 * F1.2 — explicit per-block context budgets for auxiliary model context.
 *
 * Every additional context block injected into a Gemini turn has a documented
 * maximum here. Blocks that could otherwise grow unbounded (seller metrics,
 * behavior history, client error reports, search filters, wizard bits) are
 * clamped through these budgets + the canonical shared truncation helper.
 */
import { clampJsonBlock, truncateTextSafely } from "../shared/text-truncation.js";

export const CONTEXT_BLOCK_BUDGET = {
  /** Serialized seller-metrics JSON inside the wizard block. */
  sellerMetrics: 320,
  /** Upper bound for any single seller-metric value. */
  sellerMetricsValue: 1_000_000,
  behaviorEventType: 40,
  /** Serialized JSON of ONE behavior-history event payload. */
  behaviorEventPayload: 160,
  lastErrorCode: 40,
  lastErrorMessage: 200,
  wizardBit: 200,
  currentView: 40,
  wizardMode: 40,
  emptySearchQuery: 120,
  /** Serialized JSON of activeSearchFilters inside memory / offer blocks. */
  searchFiltersJson: 600,
} as const;

const SELLER_METRIC_KEYS = [
  "views",
  "callClicks",
  "chatStarts",
  "saves",
  "interestScore",
  "buyerIntentCount",
] as const;

/**
 * Client analytics values are UNTRUSTED numbers: only finite, non-negative,
 * bounded integers for the known metric keys survive. Returns a bounded JSON
 * string ("" when nothing valid remains). Never throws.
 */
export function sanitizeSellerMetrics(raw: unknown): string {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
    const source = raw as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const key of SELLER_METRIC_KEYS) {
      const value = source[key];
      if (value === undefined) continue;
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        n < 0 ||
        n > CONTEXT_BLOCK_BUDGET.sellerMetricsValue
      ) {
        continue;
      }
      out[key] = Math.trunc(n);
    }
    if (Object.keys(out).length === 0) return "";
    return clampJsonBlock(out, CONTEXT_BLOCK_BUDGET.sellerMetrics);
  } catch {
    return "";
  }
}

export function boundContextText(value: unknown, maxLen: number): string {
  return truncateTextSafely(value, maxLen);
}
