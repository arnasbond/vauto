/**
 * VAUTO AI Core v2 — real Gemini reasoning provider.
 *
 * Implements ReasoningProvider behind a compact, principle-based system
 * instruction and Gemini structured output. It does NOT import the legacy
 * orchestrator/planner and contains no intent routing, regex, or fast-path.
 */
import { resolveGeminiApiKey } from "../../load-env.js";
import type {
  ReasoningInput,
  ReasoningDecision,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import { executionEligibleHardConstraints } from "../state/marketplace-state.js";
import { CORE_V2_SYSTEM_INSTRUCTION, buildReasoningUserPrompt } from "./prompt.js";
import { REASONING_DECISION_SCHEMA, parseReasoningDecision } from "./schema.js";
import {
  CORE_V2_MAX_REASONING_ATTEMPTS,
  CORE_V2_MODEL,
  CORE_V2_REASONING_TIMEOUT_MS,
} from "./model-config.js";

export { CORE_V2_MODEL };

export type ProviderFailureCode =
  | "provider_unavailable"
  | "http_error"
  | "timeout"
  | "malformed_json"
  | "schema_invalid";

/** Typed provider failure so the shadow harness can classify cleanly. */
export class ProviderFailureError extends Error {
  readonly code: ProviderFailureCode;
  readonly status?: number;
  constructor(code: ProviderFailureCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderFailureError";
    this.code = code;
    this.status = status;
  }
}

/** A transient failure worth a bounded retry (timeout / 5xx / rate-limit / network). */
export function isRetryableFailure(err: unknown): boolean {
  if (!(err instanceof ProviderFailureError)) return false;
  if (err.code === "timeout") return true;
  if (err.code === "http_error") {
    if (err.status === 429) return true;
    if (err.status != null && err.status >= 500) return true;
    // No HTTP status: the fetch threw before a response (network/DNS/reset) —
    // transient, bounded retry has value and is still capped by the turn budget.
    if (err.status == null) return true;
    return false;
  }
  return false;
}

function summarizeState(input: ReasoningInput): string {
  const s = input.state;
  const hard = executionEligibleHardConstraints(s);
  const hardParts = Object.entries(hard).map(([k, v]) => `${k}=${String(v)}`);
  const soft = s.softPreferences.map((p) => p.label);
  const exclusions = s.exclusions.map((e) => e.label);
  const lines: string[] = [];
  if (s.goal) lines.push(`goal=${s.goal}`);
  if (s.vertical) lines.push(`vertical=${s.vertical}`);
  if (hardParts.length) lines.push(`hard(user)=${hardParts.join(", ")}`);
  if (soft.length) lines.push(`soft=${soft.join(", ")}`);
  if (exclusions.length) lines.push(`exclusions=${exclusions.join(", ")}`);
  if (s.unresolved.length) lines.push(`unresolved=${s.unresolved.join(" | ")}`);
  if (s.selectedListingIds.length) lines.push(`selected=${s.selectedListingIds.join(", ")}`);
  return lines.join("; ") || "(tuščia)";
}

export function buildReasoningRequest(input: ReasoningInput): {
  systemInstruction: string;
  userPrompt: string;
} {
  return {
    systemInstruction: CORE_V2_SYSTEM_INSTRUCTION,
    userPrompt: buildReasoningUserPrompt({
      userTurn: input.userTurn,
      history: input.history,
      stateSummary: summarizeState(input),
      capabilities: input.capabilities.map((c) => `${c.name}(${c.operation})`),
      groundedResults: input.groundedResults?.map((g) =>
        g.ok ? `${g.capability}: ${g.summary ?? ""}` : `${g.capability}: KLAIDA ${g.error ?? ""}`
      ),
    }),
  };
}

export interface ReasoningAttemptTelemetry {
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
  candidateCount?: number;
  finishReason?: string;
  blockReason?: string;
  parseOutcome?: "ok" | "empty" | "malformed_json" | "schema_invalid";
  capabilityRequested?: string;
}

export interface GeminiReasoningProviderOptions {
  model?: string;
  /** Overridable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Provider timeout (ms). */
  timeoutMs?: number;
  /** Bounded retry count for safe, idempotent READ reasoning. */
  maxAttempts?: number;
  /** Sanitized per-attempt observability (never the credential or raw body). */
  onAttempt?: (t: ReasoningAttemptTelemetry) => void;
}

export function createGeminiReasoningProvider(
  opts: GeminiReasoningProviderOptions = {}
): ReasoningProvider {
  const model = opts.model ?? CORE_V2_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CORE_V2_REASONING_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? CORE_V2_MAX_REASONING_ATTEMPTS;
  const onAttempt = opts.onAttempt;

  async function attempt(input: ReasoningInput, key: string, attemptNumber: number): Promise<ReasoningDecision> {
    const { systemInstruction, userPrompt } = buildReasoningRequest(input);
    const t0 = Date.now();
    const emit = (partial: Omit<ReasoningAttemptTelemetry, "attempt" | "elapsedMs" | "timedOut">) =>
      onAttempt?.({
        attempt: attemptNumber,
        elapsedMs: Date.now() - t0,
        timedOut: false,
        ...partial,
      });

    let res: Response;
    try {
      res = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              responseSchema: REASONING_DECISION_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        onAttempt?.({ attempt: attemptNumber, elapsedMs: Date.now() - t0, timedOut: true });
        throw new ProviderFailureError("timeout", "provider timed out");
      }
      onAttempt?.({ attempt: attemptNumber, elapsedMs: Date.now() - t0, timedOut: false });
      throw new ProviderFailureError("http_error", err instanceof Error ? err.message : "fetch failed");
    }
    if (!res.ok) {
      emit({ status: res.status });
      throw new ProviderFailureError("http_error", `Gemini HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? "";
    const finishReason = candidate?.finishReason;
    const blockReason = data.promptFeedback?.blockReason;
    const candidateCount = data.candidates?.length ?? 0;
    const trimmed = text.trim();
    if (!trimmed) {
      emit({ parseOutcome: "empty", candidateCount, finishReason, blockReason });
      // Empty structured output → a deliberate empty decision (no-tool turn).
      return {};
    }
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      emit({ parseOutcome: "malformed_json", candidateCount, finishReason, blockReason });
      throw new ProviderFailureError("malformed_json", "model output was not valid JSON");
    }
    try {
      const decision = parseReasoningDecision(json);
      emit({
        parseOutcome: "ok",
        candidateCount,
        finishReason,
        blockReason,
        capabilityRequested: decision.capabilityRequest?.capability,
      });
      return decision;
    } catch (err) {
      emit({ parseOutcome: "schema_invalid", candidateCount, finishReason, blockReason });
      throw new ProviderFailureError(
        "schema_invalid",
        err instanceof Error ? err.message : "model output failed schema"
      );
    }
  }

  return async (input: ReasoningInput): Promise<ReasoningDecision> => {
    const key = resolveGeminiApiKey();
    if (!key) {
      throw new ProviderFailureError("provider_unavailable", "GEMINI_API_KEY not configured");
    }
    let lastErr: unknown;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await attempt(input, key, i + 1);
      } catch (err) {
        lastErr = err;
        if (!isRetryableFailure(err) || i === maxAttempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw lastErr;
  };
}
