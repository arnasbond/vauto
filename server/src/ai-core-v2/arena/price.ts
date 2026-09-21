/**
 * VAUTO AI Core v2.3R.2 — verified provider price snapshots (immutable, dated).
 *
 * Prices are per-token (converted from official per-1M figures) and frozen at
 * capture time. Provider price changes must NOT alter historical Arena runs.
 * Source: official provider documentation, captured 2026-09-21.
 */
import type { NormalizedUsage, PriceSnapshot } from "./types.js";

/** Convert an official USD-per-1M-token price to per-token. */
function perMillion(usd: number): number {
  return usd / 1_000_000;
}

export function freezePriceSnapshot(p: PriceSnapshot): PriceSnapshot {
  return Object.freeze({ ...p });
}

/**
 * Compute cost from a snapshot + normalized usage (per-token prices).
 * Input/output are required; cached/reasoning are optional (0 if unreported).
 * Returns null if a required metric/price is missing, or if short-context
 * pricing is exceeded without a long-context price — never fabricates.
 */
export function computeCost(usage: NormalizedUsage, p: PriceSnapshot): number | null {
  if (usage.inputTokens == null || p.inputPrice == null) return null;
  if (usage.outputTokens == null || p.outputPrice == null) return null;

  const cached = usage.cachedInputTokens != null && p.cachedInputPrice != null ? usage.cachedInputTokens * p.cachedInputPrice : 0;
  const reasoning = usage.reasoningTokens != null && p.reasoningPrice != null ? usage.reasoningTokens * p.reasoningPrice : 0;

  if (p.shortContextMaxPromptTokens != null && usage.inputTokens > p.shortContextMaxPromptTokens) {
    if (p.longContextInputPrice == null || p.longContextOutputPrice == null) return null;
    return usage.inputTokens * p.longContextInputPrice + usage.outputTokens * p.longContextOutputPrice + cached + reasoning;
  }

  return usage.inputTokens * p.inputPrice + usage.outputTokens * p.outputPrice + cached + reasoning;
}

export const GEMINI_FLASH_PRICE: PriceSnapshot = freezePriceSnapshot({
  provider: "google",
  model: "gemini-2.5-flash",
  inputPrice: perMillion(0.3),
  outputPrice: perMillion(2.5),
  cachedInputPrice: perMillion(0.03),
  reasoningPrice: null,
  currency: "USD",
  source: "Google Gemini API pricing documentation",
  effectiveDate: "2026-09-21",
  capturedAt: "2026-09-21",
});

export const DEEPSEEK_FLASH_PEAK: PriceSnapshot = freezePriceSnapshot({
  provider: "deepseek",
  model: "deepseek-flash (DeepSeek-V4.1-Flash)",
  inputPrice: perMillion(0.3),
  outputPrice: perMillion(1.2),
  cachedInputPrice: perMillion(0.006),
  reasoningPrice: null,
  currency: "USD",
  source: "DeepSeek official pricing documentation",
  effectiveDate: "2026-09-21",
  capturedAt: "2026-09-21",
});

export const DEEPSEEK_FLASH_OFFPEAK: PriceSnapshot = freezePriceSnapshot({
  provider: "deepseek",
  model: "deepseek-flash (DeepSeek-V4.1-Flash)",
  inputPrice: perMillion(0.15),
  outputPrice: perMillion(0.6),
  cachedInputPrice: perMillion(0.003),
  reasoningPrice: null,
  currency: "USD",
  source: "DeepSeek official pricing documentation",
  effectiveDate: "2026-09-21",
  capturedAt: "2026-09-21",
});

export const MISTRAL_SMALL_PRICE: PriceSnapshot = freezePriceSnapshot({
  provider: "mistral",
  model: "mistral-small-2603 (Mistral Small 4)",
  inputPrice: perMillion(0.15),
  outputPrice: perMillion(0.6),
  cachedInputPrice: perMillion(0.015),
  reasoningPrice: null,
  currency: "USD",
  source: "Mistral official pricing documentation",
  effectiveDate: "2026-09-21",
  capturedAt: "2026-09-21",
});

export const OPENAI_LUNA_PRICE: PriceSnapshot = freezePriceSnapshot({
  provider: "openai",
  model: "gpt-5.6-luna",
  inputPrice: perMillion(0.2),
  outputPrice: perMillion(1.2),
  cachedInputPrice: perMillion(0.02),
  reasoningPrice: null,
  currency: "USD",
  source: "OpenAI official pricing documentation",
  effectiveDate: "2026-09-21",
  capturedAt: "2026-09-21",
  shortContextMaxPromptTokens: 272_000,
  longContextInputPrice: null,
  longContextOutputPrice: null,
});

/** All verified snapshots, keyed for the first Arena run. */
export const ARENA_PRICE_SNAPSHOTS: Record<string, PriceSnapshot> = {
  gemini: GEMINI_FLASH_PRICE,
  deepseekPeak: DEEPSEEK_FLASH_PEAK,
  deepseekOffPeak: DEEPSEEK_FLASH_OFFPEAK,
  mistral: MISTRAL_SMALL_PRICE,
  openai: OPENAI_LUNA_PRICE,
};
