/**
 * VAUTO AI Core v2 — DeepSeek V4.1 Flash reasoning provider.
 *
 * Emits raw semantic JSON using DeepSeek JSON mode (`response_format: { type: "json_object" }`).
 * Passes raw output directly to VAUTO's canonical `parseSemanticDecision()` parser
 * for strict phase-aware actionKind validation.
 */
import { resolveDeepSeekApiKey } from "../../load-env.js";
import type {
  ReasoningInput,
  ReasoningDecision,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import {
  DEEPSEEK_V4_1_FLASH_MODEL,
  CORE_V2_MAX_REASONING_ATTEMPTS,
  CORE_V2_REASONING_TIMEOUT_MS,
} from "./model-config.js";
import { ProviderFailureError } from "./provider-errors.js";
import {
  R3_SYSTEM_INSTRUCTION,
  buildR3UserPrompt,
  parseSemanticDecision,
  semanticDecisionToReasoningDecision,
  type SemanticDecision,
} from "./semantic-claim.js";

export interface DeepSeekReasoningAttemptTelemetry {
  provider: "deepseek";
  model: string;
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
  parseOutcome?: "ok" | "empty" | "malformed_json" | "schema_invalid";
  capabilityRequested?: string;
}

export interface DeepSeekReasoningProviderOptions {
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  apiKey?: string;
  onAttempt?: (t: DeepSeekReasoningAttemptTelemetry) => void;
}

export interface DeepSeekSemanticTransportResult {
  decision: SemanticDecision;
  rawUsage: Record<string, unknown> | undefined;
  rawText: string;
  latencyMs: number;
  attempts: number;
}

export async function callDeepSeekSemanticTransport(
  input: ReasoningInput,
  opts: DeepSeekReasoningProviderOptions = {}
): Promise<DeepSeekSemanticTransportResult> {
  const model = opts.model ?? DEEPSEEK_V4_1_FLASH_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CORE_V2_REASONING_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? CORE_V2_MAX_REASONING_ATTEMPTS;
  const key = opts.apiKey ?? resolveDeepSeekApiKey();
  if (!key) throw new ProviderFailureError("provider_unavailable", "DEEPSEEK_API_KEY not configured");

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    try {
      const res = await doFetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: R3_SYSTEM_INSTRUCTION },
            { role: "user", content: buildR3UserPrompt(input) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: false,
          status: res.status,
        });
        throw new ProviderFailureError("http_error", `DeepSeek HTTP ${res.status}`, res.status);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: Record<string, unknown>;
      };
      const text = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!text) {
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: false,
          parseOutcome: "empty",
        });
        throw new ProviderFailureError("empty_response", "DeepSeek returned empty content");
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: false,
          parseOutcome: "malformed_json",
        });
        throw new ProviderFailureError("malformed_json", "model output was not valid JSON");
      }

      try {
        const decision = parseSemanticDecision(json);
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: false,
          parseOutcome: "ok",
          capabilityRequested: decision.capabilityRequest?.capability,
        });
        return {
          decision,
          rawUsage: data.usage,
          rawText: text,
          latencyMs: Date.now() - t0,
          attempts: attempt,
        };
      } catch (err) {
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: false,
          parseOutcome: "schema_invalid",
        });
        throw err;
      }
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        opts.onAttempt?.({
          provider: "deepseek",
          model,
          attempt,
          elapsedMs: Date.now() - t0,
          timedOut: true,
        });
        // Interactive timeouts must fail closed immediately without retries
        throw new ProviderFailureError("timeout", "provider timed out");
      }

      lastError = err;
      if (err instanceof ProviderFailureError && (err.code === "timeout" || err.code === "schema_invalid" || err.code === "malformed_json" || err.code === "provider_unavailable")) {
        throw err;
      }
      if (attempt === maxAttempts) throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new ProviderFailureError("unknown", String(lastError));
}

export function createDeepSeekReasoningProvider(
  opts: DeepSeekReasoningProviderOptions = {}
): ReasoningProvider {
  return async (input: ReasoningInput): Promise<ReasoningDecision> => {
    const transportResult = await callDeepSeekSemanticTransport(input, opts);
    return semanticDecisionToReasoningDecision(transportResult.decision);
  };
}
