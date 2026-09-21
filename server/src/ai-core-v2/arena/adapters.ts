/**
 * VAUTO AI Core v2.3R.2 — verified provider descriptors (NO calls).
 *
 * Contract capability is classified explicitly so JSON_ONLY is never
 * presented as equivalent to strict schema enforcement. No credentials.
 */
import type { ReasoningProvider } from "../reasoning/reasoning-contract.js";
import type { ArenaProvider } from "./types.js";
import { NO_USAGE } from "./types.js";
import { normalizeError } from "./normalize.js";

export type StructuredCapability = "STRICT_SCHEMA" | "CUSTOM_SCHEMA" | "JSON_ONLY";

export interface ProviderAdapterDescriptor {
  provider: string;
  model: string;
  endpoint: string;
  authHeader: string;
  capability: StructuredCapability;
  structuredOutputMechanism: string;
  notes: string[];
}

export const GEMINI_ADAPTER: ProviderAdapterDescriptor = {
  provider: "google",
  model: "gemini-2.5-flash",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  authHeader: "x-goog-api-key",
  capability: "STRICT_SCHEMA",
  structuredOutputMechanism: "responseMimeType:application/json + responseSchema (OpenAPI subset)",
  notes: ["schema-enforced; enum/required honored", "usageMetadata provides prompt/candidates/thoughts/cached/total tokens"],
};

export const DEEPSEEK_ADAPTER: ProviderAdapterDescriptor = {
  provider: "deepseek",
  model: "deepseek-flash (DeepSeek-V4.1-Flash)",
  endpoint: "https://api.deepseek.com/chat/completions",
  authHeader: "Authorization: Bearer",
  capability: "JSON_ONLY",
  structuredOutputMechanism: 'response_format:{type:"json_object"} (NO strict schema)',
  notes: [
    "JSON Output is NOT equivalent to strict schema enforcement",
    "official docs warn JSON Output can occasionally return empty content",
    "adapter parses + validates locally; malformed/schema-invalid => CONTRACT_FAIL",
  ],
};

export const MISTRAL_ADAPTER: ProviderAdapterDescriptor = {
  provider: "mistral",
  model: "mistral-small-2603 (Mistral Small 4)",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  authHeader: "Authorization: Bearer",
  capability: "CUSTOM_SCHEMA",
  structuredOutputMechanism: 'response_format:{type:"json_schema",json_schema:{...}} (custom Structured Outputs)',
  notes: ["256k context", "Structured Outputs + Function Calling supported"],
};

export const OPENAI_ADAPTER: ProviderAdapterDescriptor = {
  provider: "openai",
  model: "gpt-5.6-luna",
  endpoint: "https://api.openai.com/v1/chat/completions",
  authHeader: "Authorization: Bearer",
  capability: "STRICT_SCHEMA",
  structuredOutputMechanism: 'response_format:{type:"json_schema",json_schema:{...}} (Structured Outputs)',
  notes: [
    "1.05M context, max output 128k",
    "higher pricing for prompts >272K tokens — snapshot must guard this threshold",
    "reasoning effort configurable (fixed setting for fairness)",
  ],
};

export const PROVIDER_ADAPTERS: ProviderAdapterDescriptor[] = [
  GEMINI_ADAPTER,
  DEEPSEEK_ADAPTER,
  MISTRAL_ADAPTER,
  OPENAI_ADAPTER,
];

/** Thin bridge from a raw ReasoningProvider to an ArenaProvider (no usage). */
export function toArenaProvider(provider: string, model: string, raw: ReasoningProvider): ArenaProvider {
  return async (request) => {
    const t0 = Date.now();
    try {
      const decision = (await raw(request)) ?? null;
      return { decision, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, info: { provider, model } };
    } catch (err) {
      return { decision: null, usage: NO_USAGE, latencyMs: Date.now() - t0, attempts: 1, info: { provider, model }, error: normalizeError(err) };
    }
  };
}
