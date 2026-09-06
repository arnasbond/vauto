/**
 * E2.2 — PROVIDER-AGNOSTIC structured-output adapter for the planner.
 *
 * Agent Core (planner-llm.ts) depends ONLY on this typed contract — never
 * on a specific provider's HTTP endpoint, API key shape, or response shape.
 * The provider layer resolves the concrete model via the VAUTO model router
 * (`foundation/model-router.ts`); the default remains Gemini 2.5 Flash.
 */

export interface PlannerPromptParts {
  /** Canonical structured state (draft/search/flow/auth). */
  stateBlock: string;
  /** Bounded compact memory of OLDER turns — ADVISORY, never authority. */
  memoryBlock: string;
  /** DURABLE salient memory (long-term goals, important facts, agreements)
   *  derived deterministically from the canonical thread — ADVISORY, never
   *  authority. */
  salientMemoryBlock: string;
  /** Canonical significant facts (deterministic extractors) — the fact
   *  authority for context; recent-conflict resolution prefers these. */
  factsBlock: string;
  /** Current goal / intent continuation, if known. */
  goalBlock: string;
  /** Unresolved/pending action state (confirmation / VIN review). */
  pendingBlock: string;
  /** Recent user+assistant turns (bounded window). */
  historyBlock: string;
  /** The current user message (verbatim, sanitized by the caller). */
  lastUserText: string;
}

export interface PlannerStructuredRequest {
  systemInstruction: string;
  parts: PlannerPromptParts;
  /** Tool-call / structured-output declaration name. */
  schemaName: string;
  /** JSON-schema of the typed decision (function declaration parameters). */
  schemaJson: Record<string, unknown>;
}

export interface PlannerStructuredResponse {
  /** The model's typed arguments for the structured output. */
  args: Record<string, unknown>;
  /** Provider + model that answered (telemetry). */
  provider: string;
  model: string;
}

/** Provider-unavailable: no key / network / HTTP failure. */
export class PlannerProviderUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PlannerProviderUnavailableError";
  }
}

/** Model answered but the structured output was missing/invalid. */
export class PlannerStructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerStructuredOutputError";
  }
}

export interface PlannerLlmAdapter {
  readonly providerId: string;
  planStructured(req: PlannerStructuredRequest): Promise<PlannerStructuredResponse>;
}
