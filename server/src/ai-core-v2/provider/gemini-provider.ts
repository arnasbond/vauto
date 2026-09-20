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

export const CORE_V2_MODEL = process.env.VAUTO_CORE_V2_MODEL?.trim() || "gemini-2.0-flash";

export type ProviderFailureCode =
  | "provider_unavailable"
  | "http_error"
  | "timeout"
  | "malformed_json"
  | "schema_invalid";

/** Typed provider failure so the shadow harness can classify cleanly. */
export class ProviderFailureError extends Error {
  readonly code: ProviderFailureCode;
  constructor(code: ProviderFailureCode, message: string) {
    super(message);
    this.name = "ProviderFailureError";
    this.code = code;
  }
}

function summarizeState(input: ReasoningInput): string {
  const s = input.state;
  const hard = executionEligibleHardConstraints(s);
  const hardParts = Object.entries(hard).map(([k, v]) => `${k}=${String(v)}`);
  const soft = s.softPreferences.map((p) => p.label);
  const lines: string[] = [];
  if (s.goal) lines.push(`goal=${s.goal}`);
  if (s.vertical) lines.push(`vertical=${s.vertical}`);
  if (hardParts.length) lines.push(`hard(user)=${hardParts.join(", ")}`);
  if (soft.length) lines.push(`soft=${soft.join(", ")}`);
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
      capabilities: input.capabilities.map((c) => `${c.name}(${c.consequence})`),
      groundedResults: input.groundedResults?.map((g) =>
        g.ok ? `${g.capability}: ${g.summary ?? ""}` : `${g.capability}: KLAIDA ${g.error ?? ""}`
      ),
    }),
  };
}

export interface GeminiReasoningProviderOptions {
  model?: string;
  /** Overridable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Provider timeout (ms). */
  timeoutMs?: number;
}

export function createGeminiReasoningProvider(
  opts: GeminiReasoningProviderOptions = {}
): ReasoningProvider {
  const model = opts.model ?? CORE_V2_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return async (input: ReasoningInput): Promise<ReasoningDecision> => {
    const key = resolveGeminiApiKey();
    if (!key) {
      throw new ProviderFailureError("provider_unavailable", "GEMINI_API_KEY not configured");
    }
    const { systemInstruction, userPrompt } = buildReasoningRequest(input);

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
        throw new ProviderFailureError("timeout", "provider timed out");
      }
      throw new ProviderFailureError("http_error", err instanceof Error ? err.message : "fetch failed");
    }
    if (!res.ok) {
      throw new ProviderFailureError("http_error", `Gemini HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const trimmed = text.trim();
    if (!trimmed) {
      // Empty structured output → a deliberate empty decision (no-tool turn).
      return {};
    }
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new ProviderFailureError("malformed_json", "model output was not valid JSON");
    }
    try {
      return parseReasoningDecision(json);
    } catch (err) {
      throw new ProviderFailureError(
        "schema_invalid",
        err instanceof Error ? err.message : "model output failed schema"
      );
    }
  };
}
