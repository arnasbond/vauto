/**
 * VAUTO AI Core v2.3R — normalized usage/error classification.
 *
 * Providers may report different shapes; this collapses them into one neutral
 * representation. Missing metrics are null, never guessed.
 */
import type { NormalizedError, NormalizedUsage } from "./types.js";
import { NO_USAGE } from "./types.js";

/** Map a provider-reported raw usage object into normalized usage. */
export function normalizeUsage(raw: Record<string, unknown> | null | undefined): NormalizedUsage {
  if (!raw) return NO_USAGE;
  const n = (k: string): number | null => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const nested = (key: string, sub: string): number | null => {
    const o = raw[key];
    if (!o || typeof o !== "object") return null;
    const v = (o as Record<string, unknown>)[sub];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    inputTokens:
      n("promptTokenCount") ?? n("inputTokens") ?? n("prompt_tokens") ?? n("input_tokens"),
    outputTokens:
      n("candidatesTokenCount") ?? n("outputTokens") ?? n("completion_tokens") ?? n("output_tokens"),
    reasoningTokens:
      n("thoughtsTokenCount") ?? n("reasoningTokens") ?? n("reasoning_tokens") ?? nested("completion_tokens_details", "reasoning_tokens"),
    cachedInputTokens:
      n("cachedContentTokenCount") ?? n("cachedInputTokens") ?? n("cached_tokens") ?? n("prompt_cache_hit_tokens") ?? nested("prompt_tokens_details", "cached_tokens"),
    totalTokens: n("totalTokenCount") ?? n("totalTokens") ?? n("total_tokens"),
    cost: n("cost") ?? n("costUsd") ?? n("totalCost"),
  };
}

/**
 * Normalize a provider/adapter error into a single code + retryability.
 * Provider-specific error types are translated HERE only — never into
 * VAUTO semantics.
 */
export function normalizeError(err: unknown): NormalizedError {
  const e = err as { code?: string; status?: number; name?: string; message?: string } | null;
  const code = e?.code ?? e?.name ?? "";
  const status = e?.status;
  if (code === "timeout" || /timeout|abort/i.test(code)) {
    return { code: "timeout", retryable: true };
  }
  if (code === "provider_unavailable") {
    return { code: "provider_unavailable", retryable: false };
  }
  if (code === "malformed_json") {
    return { code: "malformed_json", retryable: false };
  }
  if (code === "schema_invalid") {
    return { code: "schema_invalid", retryable: false };
  }
  if (code === "state_patch_contract") {
    return { code: "contract_error", retryable: false };
  }
  if (code === "http_error") {
    const retryable = status === 429 || (status != null && status >= 500) || status == null;
    return { code: "http_error", status, retryable };
  }
  return { code: "unknown", retryable: false };
}
