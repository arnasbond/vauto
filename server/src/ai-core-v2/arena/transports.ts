/**
 * VAUTO AI Core v2.3R.2 — provider transport adapters (NO calls).
 *
 * Each adapter translates the SAME R3 semantic contract into the provider's
 * native structured-output mechanism. Adapters only translate transport/schema
 * syntax — no provider-specific semantic hints, no scenario phrases. Adapters
 * read credentials only through runtime injection. All are tested via mocked
 * HTTP only.
 */
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";
import {
  R3_SYSTEM_INSTRUCTION,
  SEMANTIC_CLAIM_SCHEMA,
  parseSemanticDecision,
  buildR3UserPrompt,
  callGeminiSemanticTransport,
  type SemanticDecision,
} from "../provider/semantic-claim.js";
import type { NormalizedError, NormalizedUsage } from "./types.js";
import { NO_USAGE } from "./types.js";
import { normalizeUsage, normalizeError } from "./normalize.js";
import type { StructuredCapability } from "./adapters.js";

export interface TransportIdentity {
  transport: "direct" | "openrouter";
  requestedModel?: string;
  returnedModel?: string;
  requestedUpstreamProvider?: string;
  actualUpstreamProvider?: string;
  fallbackAllowed: boolean;
  /** Explicit routing mode (never inferred from model names). */
  routing?: "pinned" | "eligible_endpoints";
  /** HTTP status of the underlying provider request, if captured. */
  httpStatus?: number;
}

export interface AdapterResult {
  decision: SemanticDecision | null;
  usage: NormalizedUsage;
  latencyMs: number;
  attempts: number;
  error?: NormalizedError;
  /** Raw model output text (for canonical post-generation validation). */
  rawOutput?: string;
  transportIdentity?: TransportIdentity;
}

export interface TransportAdapter {
  provider: string;
  model: string;
  capability: StructuredCapability;
  call(request: ReasoningInput): Promise<AdapterResult>;
}

export interface TransportOptions {
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Arena benchmark: max paid reasoning attempts per task (default 1). */
  maxAttempts?: number;
  /** OpenAI: fixed reasoning effort, identical across all cases for fairness. */
  reasoningEffort?: "low" | "medium" | "high";
}

const ROLES = new Set(["constraint", "subject", "preference", "exclusion", "goal", "unresolved", "retraction"]);
const CONCEPTS = new Set(["price", "location", "category"]);
const BOUNDARIES = new Set(["min", "max"]);
const STRENGTHS = new Set(["hard", "soft", "ambiguous"]);
const TARGETS = new Set(["constraint", "subject", "preference", "exclusion"]);

/** Strict local validation of the parsed output against the SAME contract. */
export function validateStrict(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "decision must be an object";
  const r = raw as Record<string, unknown>;
  if (r.claims == null) return null;
  if (!Array.isArray(r.claims)) return "claims must be an array";
  for (const item of r.claims) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "claim must be an object";
    const it = item as Record<string, unknown>;
    if (it.role != null && !ROLES.has(String(it.role))) return `invalid role: ${String(it.role)}`;
    if (it.concept != null && !CONCEPTS.has(String(it.concept))) return `invalid concept: ${String(it.concept)}`;
    if (it.boundary != null && !BOUNDARIES.has(String(it.boundary))) return `invalid boundary: ${String(it.boundary)}`;
    if (it.strength != null && !STRENGTHS.has(String(it.strength))) return `invalid strength: ${String(it.strength)}`;
    if (it.target != null && !TARGETS.has(String(it.target))) return `invalid target: ${String(it.target)}`;
    if (it.value != null && typeof it.value !== "string" && typeof it.value !== "number") return "value must be a scalar";
  }
  return null;
}

/** Parse provider text → decision; malformed/schema-invalid → normalized error (with reason). */
export function parseDecisionText(text: string): { decision: SemanticDecision | null; error?: NormalizedError } {
  if (!text || !text.trim()) return { decision: null };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { decision: null, error: { code: "malformed_json", retryable: false, reason: "output was not valid JSON" } };
  }
  const invalid = validateStrict(json);
  if (invalid) return { decision: null, error: { code: "schema_invalid", retryable: false, reason: invalid } };
  return { decision: parseSemanticDecision(json) };
}

/**
 * CANONICAL Arena post-generation validation. Applied to EVERY provider's raw
 * output (including Gemini) so cross-provider scoring is comparable, while the
 * native Gemini parse stays lenient for baseline compatibility.
 */
export function canonicalContractValid(rawOutput: string | undefined): boolean {
  if (rawOutput == null || !rawOutput.trim()) return false;
  let json: unknown;
  try {
    json = JSON.parse(rawOutput);
  } catch {
    return false;
  }
  return validateStrict(json) === null;
}

async function tryFetch(url: string, init: RequestInit, doFetch: typeof fetch, timeoutMs: number): Promise<{ data: unknown; error?: NormalizedError; status?: number }> {
  try {
    const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { data: null, error: normalizeError({ code: "http_error", status: res.status }), status: res.status };
    return { data: await res.json(), status: res.status };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { data: null, error: { code: "timeout", retryable: true } };
    }
    return { data: null, error: { code: "http_error", retryable: true } };
  }
}

export function createGeminiTransport(opts: TransportOptions = {}): TransportAdapter {
  const model = opts.model ?? "gemini-2.5-flash";
  return {
    provider: "google",
    model,
    capability: "STRICT_SCHEMA",
    call: async (request) => {
      try {
        const r = await callGeminiSemanticTransport(request, {
          model,
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          apiKey: opts.apiKey,
          maxAttempts: opts.maxAttempts ?? 1,
        });
        return {
          decision: r.decision,
          usage: normalizeUsage(r.rawUsage),
          latencyMs: r.latencyMs,
          attempts: r.attempts,
          rawOutput: r.rawText,
          transportIdentity: { transport: "direct", requestedModel: model, returnedModel: model, fallbackAllowed: false },
        };
      } catch (err) {
        return { decision: null, usage: NO_USAGE, latencyMs: 0, attempts: 1, error: normalizeError(err), transportIdentity: { transport: "direct", requestedModel: model, fallbackAllowed: false } };
      }
    },
  };
}

export function createDeepSeekTransport(opts: TransportOptions = {}): TransportAdapter {
  const model = opts.model ?? "deepseek-flash";
  const doFetch = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? "";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return {
    provider: "deepseek",
    model,
    capability: "JSON_ONLY",
    call: async (request) => {
      const t0 = Date.now();
      const res = await tryFetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: R3_SYSTEM_INSTRUCTION },
              { role: "user", content: buildR3UserPrompt(request) },
            ],
            response_format: { type: "json_object" },
          }),
        },
        doFetch,
        timeoutMs
      );
      if (res.error) return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: res.error, transportIdentity: { transport: "direct", requestedModel: model, fallbackAllowed: false } };
      const data = res.data as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseDecisionText(content);
      return { decision: parsed.decision, usage: normalizeUsage(data.usage), latencyMs: Date.now() - t0, attempts: 1, error: parsed.error, rawOutput: content, transportIdentity: { transport: "direct", requestedModel: model, returnedModel: model, fallbackAllowed: false } };
    },
  };
}

export function createMistralTransport(opts: TransportOptions = {}): TransportAdapter {
  const model = opts.model ?? "mistral-small-2603";
  const doFetch = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? "";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return {
    provider: "mistral",
    model,
    capability: "CUSTOM_SCHEMA",
    call: async (request) => {
      const t0 = Date.now();
      const res = await tryFetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: R3_SYSTEM_INSTRUCTION },
              { role: "user", content: buildR3UserPrompt(request) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "decision", schema: SEMANTIC_CLAIM_SCHEMA } },
          }),
        },
        doFetch,
        timeoutMs
      );
      if (res.error) return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: res.error, transportIdentity: { transport: "direct", requestedModel: model, fallbackAllowed: false } };
      const data = res.data as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseDecisionText(content);
      return { decision: parsed.decision, usage: normalizeUsage(data.usage), latencyMs: Date.now() - t0, attempts: 1, error: parsed.error, rawOutput: content, transportIdentity: { transport: "direct", requestedModel: model, returnedModel: model, fallbackAllowed: false } };
    },
  };
}

export function createOpenAITransport(opts: TransportOptions = {}): TransportAdapter {
  const model = opts.model ?? "gpt-5.6-luna";
  const doFetch = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? "";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const reasoningEffort = opts.reasoningEffort ?? "medium";
  return {
    provider: "openai",
    model,
    capability: "STRICT_SCHEMA",
    call: async (request) => {
      const t0 = Date.now();
      const res = await tryFetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: R3_SYSTEM_INSTRUCTION },
              { role: "user", content: buildR3UserPrompt(request) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "decision", schema: SEMANTIC_CLAIM_SCHEMA, strict: true } },
            reasoning: { effort: reasoningEffort },
          }),
        },
        doFetch,
        timeoutMs
      );
      if (res.error) return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: res.error, transportIdentity: { transport: "direct", requestedModel: model, fallbackAllowed: false } };
      const data = res.data as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseDecisionText(content);
      return { decision: parsed.decision, usage: normalizeUsage(data.usage), latencyMs: Date.now() - t0, attempts: 1, error: parsed.error, rawOutput: content, transportIdentity: { transport: "direct", requestedModel: model, returnedModel: model, fallbackAllowed: false } };
    },
  };
}

export const ARENA_TRANSPORTS = {
  gemini: createGeminiTransport,
  deepseek: createDeepSeekTransport,
  mistral: createMistralTransport,
  openai: createOpenAITransport,
};

/**
 * OpenRouter LAB transport — screens competitor models with one key/balance.
 * Routing is explicitly locked so a benchmark cannot silently change infra.
 * Identity (requested vs returned model/provider) is validated; a mismatch is
 * TRANSPORT_INVALID (never silently accepted).
 */
export type OpenRouterRoutingMode = "pinned" | "eligible_endpoints";

export function createOpenRouterTransport(opts: {
  model?: string;
  upstreamProvider?: string;
  capability?: StructuredCapability;
  structuredOutput?: "json_schema" | "json_object";
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  dataCollectionDeny?: boolean;
  zdr?: boolean;
  /**
   * Explicit routing mode (NEVER inferred from model names).
   * - "pinned" (default): existing R.5 behavior — provider.only allowlist,
   *   no fallback.
   * - "eligible_endpoints": R.6 Arena — no provider.only, allow fallbacks only
   *   between eligible upstream providers serving the SAME requested model.
   */
  routing?: OpenRouterRoutingMode;
} = {}): TransportAdapter {
  const model = opts.model ?? "";
  const upstream = opts.upstreamProvider ?? "";
  const doFetch = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? "";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const capability = opts.capability ?? "CUSTOM_SCHEMA";
  const structuredOutput = opts.structuredOutput ?? "json_schema";
  const dataCollectionDeny = opts.dataCollectionDeny ?? true;
  const routing: OpenRouterRoutingMode = opts.routing ?? "pinned";

  return {
    provider: "openrouter",
    model,
    capability,
    call: async (request) => {
      const t0 = Date.now();
      const provider: Record<string, unknown> = {};
      if (routing === "pinned") {
        provider.only = [upstream];
        provider.allow_fallbacks = false;
        provider.require_parameters = true;
      } else {
        provider.allow_fallbacks = true;
        provider.require_parameters = true;
      }
      if (dataCollectionDeny) provider.data_collection = "deny";
      if (opts.zdr && routing === "pinned") provider.zdr = true;

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: R3_SYSTEM_INSTRUCTION },
          { role: "user", content: buildR3UserPrompt(request) },
        ],
        provider,
      };
      if (structuredOutput === "json_schema") {
        body.response_format = { type: "json_schema", json_schema: { name: "decision", schema: SEMANTIC_CLAIM_SCHEMA, strict: true } };
      } else {
        body.response_format = { type: "json_object" };
      }

      const identity: TransportIdentity = {
        transport: "openrouter",
        requestedModel: model,
        requestedUpstreamProvider: routing === "pinned" ? upstream : undefined,
        fallbackAllowed: routing === "eligible_endpoints",
        routing,
      };
      const res = await tryFetch(
        "https://openrouter.ai/api/v1/chat/completions",
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) },
        doFetch,
        timeoutMs
      );
      identity.httpStatus = res.status;
      if (res.error) {
        return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: res.error, transportIdentity: identity };
      }
      const data = res.data as { choices?: Array<{ message?: { content?: string } }>; model?: string; provider?: string; usage?: Record<string, unknown> };
      const content = data.choices?.[0]?.message?.content ?? "";
      identity.returnedModel = data.model;
      identity.actualUpstreamProvider = data.provider;

      if (data.model && data.model !== model) {
        return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: { code: "transport_invalid", retryable: false }, rawOutput: content, transportIdentity: identity };
      }
      if (routing === "pinned" && data.provider && upstream && data.provider !== upstream) {
        return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, error: { code: "transport_invalid", retryable: false }, rawOutput: content, transportIdentity: identity };
      }
      const parsed = parseDecisionText(content);
      return { decision: parsed.decision, usage: normalizeUsage(data.usage), latencyMs: Date.now() - t0, attempts: 1, error: parsed.error, rawOutput: content, transportIdentity: identity };
    },
  };
}
