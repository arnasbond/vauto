/**
 * VAUTO AI Core v2 — single source of truth for model + transport config.
 *
 * The reasoning provider and the authority verifier MUST share the same model
 * identifier (no hardcoded drift). Live evidence (V2.3A):
 *   - gemini-2.0-flash → HTTP 404 (retired)
 *   - gemini-2.5-flash → real successful responses (occasional ~30s timeouts)
 *
 * Current Core model configuration is NOT changed; this is Core v2 only.
 */
export const CORE_V2_DEFAULT_MODEL = "gemini-2.5-flash";

export const CORE_V2_MODEL =
  process.env.VAUTO_CORE_V2_MODEL?.trim() || CORE_V2_DEFAULT_MODEL;

/**
 * Reasoning provider per-attempt timeout.
 *
 * V2.3B live evidence: successful calls 1.9–3.6s; hung calls consumed the full
 * timeout; NO successful 30–60s response was observed. A per-attempt ceiling of
 * 30s preserves every observed slow-but-successful response while halving the
 * worst-case single-call latency (30s × 2 attempts = 60s, was 120s).
 */
export const CORE_V2_REASONING_TIMEOUT_MS = 30_000;

/** Bounded retry count for safe, idempotent READ/shadow reasoning requests. */
export const CORE_V2_MAX_REASONING_ATTEMPTS = 2;

/**
 * Authority verifier timeout. On timeout/error the verifier fails CLOSED.
 * Observed verifier latency ≤3.8s; a short ceiling keeps the fail-closed tail
 * from dominating the turn budget.
 */
export const CORE_V2_VERIFIER_TIMEOUT_MS = 15_000;

/**
 * TOTAL per-turn wall-clock budget for the Core v2 loop. A per-attempt timeout
 * is NOT sufficient: this is the hard ceiling that aborts further provider
 * attempts / verifier calls / loop iterations once exhausted. Evidence-bound:
 * worst single reasoning call = 30s × 2 = 60s + verifier 15s = 75s, so 90s
 * gives a small safety margin without allowing unbounded iteration latency.
 */
export const CORE_V2_TURN_BUDGET_MS = 90_000;
