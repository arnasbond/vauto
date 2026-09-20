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

/** Reasoning provider per-attempt timeout (Gemini 2.5 can exceed 30s under load). */
export const CORE_V2_REASONING_TIMEOUT_MS = 60_000;

/** Bounded retry count for safe, idempotent READ/shadow reasoning requests. */
export const CORE_V2_MAX_REASONING_ATTEMPTS = 2;

/** Authority verifier timeout. On timeout/error the verifier fails CLOSED. */
export const CORE_V2_VERIFIER_TIMEOUT_MS = 30_000;
