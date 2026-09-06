/**
 * E0 — golden conversation harness: types & contracts.
 *
 * Purpose: measure the CURRENT end-to-end assistant behavior objectively,
 * without changing any AI orchestration. Each scenario runs against the REAL
 * `runVautoAgent` pipeline; only the model layer is substituted (deterministic
 * scripted provider or the live model) — tool execution, policy, routing and
 * history handling are the real code under test.
 */

export type ScriptedPart =
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { text: string };

export interface ScriptedModelResponse {
  /** Parts for this model round (function calls and/or text). */
  parts: ScriptedPart[];
}

export interface TurnScript {
  /** The user message the client sends this turn. */
  userText: string;
  /** Pending photo URLs (data:/http) attached to the turn, if any. */
  pendingImageUrls?: string[];
  /**
   * Reference planner plan: what the model WOULD return for each Gemini round
   * of this turn (the neutral expression of the user's intent — the script
   * never pre-writes server facts, only model-shaped tool calls/text).
   */
  model: ScriptedModelResponse[];
}

export interface TurnExpectation {
  /** Expected tool names the model+engine should have used (empty = none). */
  expectedTools?: string[];
  /**
   * Tool ARGUMENT subset assertions against the EXECUTED tool result
   * (flat result keys or nested `result.draft` keys). Only the declared
   * subset is checked — never full-arg equality.
   */
  expectedToolCalls?: Array<{ name: string; argsSubset: Record<string, unknown> }>;
  /** Tool names that turn the user's goal into an unrelated action (FAIL). */
  forbiddenTools?: string[];
  /** Search-side effect facets subset (city, maxPrice, query fragments). */
  expectedFacets?: Record<string, string | number>;
  /** The search query must contain these fragments (case-insensitive). */
  expectedQueryContains?: string[];
  /** Expected listing category after the turn (if a draft is expected). */
  category?: string;
  /** Expected draft facts (subset assertions). */
  facts?: Record<string, string | number | undefined>;
  /** Facts that must NOT appear after the turn. */
  forbiddenFacts?: string[];
  /** Expected confirmation requests (e.g. "publish", "consequential:<id>"). */
  expectedConfirmations?: string[];
  /** Forbidden confirmations. */
  forbiddenConfirmations?: string[];
  /** Expected final effects (e.g. "listing_published"). */
  expectedEffects?: string[];
  /** Forbidden mutations (e.g. "listing_published" when canceling). */
  forbiddenEffects?: string[];
  /** Model must have been consulted this turn (planner not bypassed). */
  modelMustBeConsulted?: boolean;
  /** Expected continuity: a fact from an EARLIER turn must still be visible. */
  continuity?: { factKey: string; expectedValue: string };
  /** POSITIVE outcome markers — the user's goal actually being served.
   *  ALL must be present in the reply (case-insensitive). A scenario that
   *  only asserts forbidden mutations is contract-incomplete. */
  positiveOutcome?: string[];
  /** Reply must semantically contain one of these fragments. */
  replyMustMention?: string[];
  /** Reply must NOT contain these. */
  replyMustNotMention?: string[];
  /** Authority: the turn must fail closed (no draft/effect change). */
  authorityDenied?: boolean;
}

export interface GoldenScenario {
  id: string;
  group: string;
  title: string;
  /** Initial simulator state (draft seed, user city, auth). */
  setup?: {
    authUserId?: string | null;
    isAuthenticated?: boolean;
    userCity?: string;
    contact?: string;
    profilePhone?: string;
    initialDraft?: Record<string, unknown> | null;
    freshListingSession?: boolean;
    myListings?: Array<{ id: string; title: string; status?: string }>;
  };
  turns: Array<TurnScript & { expect?: TurnExpectation }>;
  /** Scenario-level end-to-end outcome checks (checked after the last turn). */
  final?: {
    expectedEffects?: string[];
    forbiddenEffects?: string[];
    expectedFacts?: Record<string, string | number | undefined>;
  };
}

export type FailureCategory =
  | "planner_bypass"
  | "frontend_override"
  | "context_truncation"
  | "missing_assistant_history"
  | "wrong_state_source"
  | "wrong_tool"
  | "tool_override"
  | "policy_conflict"
  | "stale_state"
  | "wizard_pending_conflict"
  | "model_reasoning_failure"
  | "goal_missed"
  | "infrastructure_test_failure";

export interface TurnFailure {
  category: FailureCategory;
  message: string;
}

export interface TurnResult {
  index: number;
  userText: string;
  status: "PASS" | "FAIL";
  /** Security/policy/invariant layer correct. */
  authorityCorrect: boolean;
  /** The AI interpretation serves the user's actual goal. */
  behaviorCorrect: boolean;
  /** Structured state matches the expected facts. */
  stateCorrect: boolean;
  /** The right tools were used (no wrong/forbidden tools). */
  toolCorrect: boolean;
  /** Earlier context was preserved. */
  continuityCorrect: boolean;
  /** Everything correct — the scenario turn fully works. */
  endToEndCorrect: boolean;
  modelCalled: boolean;
  modelRounds: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  replyHead: string;
  actionsType: string;
  draft: Record<string, unknown> | null;
  failures: TurnFailure[];
}

export interface ScenarioResult {
  id: string;
  title: string;
  group: string;
  status: "PASS" | "FAIL";
  authorityCorrect: boolean;
  behaviorCorrect: boolean;
  stateCorrect: boolean;
  toolCorrect: boolean;
  continuityCorrect: boolean;
  endToEndCorrect: boolean;
  turns: TurnResult[];
  failures: TurnFailure[];
}

export interface BaselineReport {
  generatedAt: string;
  mode: "deterministic" | "live";
  headSha: string;
  total: number;
  e2ePass: number;
  behavioralFail: number;
  continuityFail: number;
  wrongToolFail: number;
  authorityPolicyFail: number;
  results: ScenarioResult[];
  taxonomy: Record<FailureCategory, number>;
}
