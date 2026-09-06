/**
 * E2 — PLANNER CENTRALIZATION contract.
 *
 * ONE server-side planner owns the REASONING decisions:
 *   user intent → plan → tool selection → clarification / response.
 *
 * The decision is a TYPED structure — orchestration never relies on model
 * text. Tool args are validated by the existing deterministic schema/policy
 * layers downstream. A planner decision is NEVER permission: the action
 * layer (auth, ownership, readiness, confirmations, policy) remains the
 * only authority source.
 */
import type { AgentSearchFilters } from "../agent-memory-context.js";

export type PlannerIntent =
  | "catalog_search"
  | "sell_create"
  | "sell_update"
  | "vin_candidate"
  | "sell_cancel"
  | "sell_preview"
  | "context_question"
  | "clarify_ambiguous"
  | "publish_request"
  | "financial_command"
  | "consequential_command"
  /** E2.1 — AI-down / unclear intent: honest dialog, NEVER a search. */
  | "ai_down_dialog"
  | "dialog";

export type PlannerRouting =
  /** Single-pass deterministic catalog search (simple queries only). */
  | "deterministic_search"
  /** Deterministic executor produces the turn result (no model round). */
  | "deterministic_executor"
  /** The model tool-loop answers (scripted/live). */
  | "model"
  /** No planner override — the pre-E2 pipeline continues unchanged. */
  | "fallthrough";

/** Canonical fact patch the planner extracted from the user turn. */
export interface PlannerFactPatch {
  price?: number;
  condition?: string;
  city?: string;
  vin?: string;
}

export interface PlannerDecision {
  intent: PlannerIntent;
  /** Short human-readable goal (telemetry/audit, never user-facing). */
  goal: string;
  continuationOf: "sell_draft" | "search_session" | "none";
  /** Canonical action name (maps onto existing side effects / tools). */
  action: string;
  /** Tool the planner selected, if any. */
  tool: string | null;
  toolArgs: PlannerFactPatch & {
    query?: string;
    filters?: Partial<AgentSearchFilters> & { rooms?: string };
  };
  needsClarification: boolean;
  clarificationQuestion: string | null;
  routing: PlannerRouting;
  /** 0..1 — deterministic rules report 1 (certain) or 0.5 (heuristic). */
  confidence: number;
  reasons: string[];
}

export interface PlannerContextInput {
  /** Server-authoritative user + assistant history (E1 ThreadStore). */
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  lastUserText: string;
  hasDraft: boolean;
  draftTitle?: string;
  draftCategory?: string;
  draftPrice?: number;
  draftLocation?: string;
  flowState?: string;
  isAuthenticated: boolean;
  /** Prior user turns that look like catalog searches (session continuity). */
  hasSearchSession: boolean;
  /** Whether a model round is possible this turn (AI-down degrade otherwise). */
  modelAvailable: boolean;
  /** E2.2 — bounded compact memory of OLDER turns. ADVISORY ONLY — never an
   *  authority source for finances/ownership/VIN/trusted values. */
  compactMemory?: string;
  /** E2.3 — DURABLE salient memory (long-term goals, important facts,
   *  agreements) derived deterministically from the CANONICAL thread.
   *  ADVISORY ONLY — canonical structured state always wins. */
  salientMemory?: string;
  /** E2.2 — canonical significant facts (draft + deterministic extractors).
   *  These WIN over recent-conflicting utterances in context assembly. */
  significantFacts?: Record<string, string>;
  /** E2.2 — current goal / intent continuation, if known. */
  currentGoal?: string;
  /** E2.2 — unresolved/pending action (confirmation / VIN review). */
  pendingAction?: string;
  /** E2.6 — canonical seller listings (slim: id/title/status). The policy
   *  layer uses them ONLY to resolve consequential-action targets — never
   *  as a reasoning source for the model's open-domain understanding. */
  myListings?: Array<{ id: string; title: string; status: string }>;
  /** E2.6 — the listing currently open in the UI, if known. */
  activeListingId?: string;
}
