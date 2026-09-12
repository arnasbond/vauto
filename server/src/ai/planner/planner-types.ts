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
  /**
   * E2.8 — explicit watch/notify-when-available request: register a
   * catalog requirement through the audited createUserRequirement
   * capability (auth policy inside) — NEVER a search prerequisite.
   */
  | "wanted_registration"
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

/**
 * R4.2 — a related/subordinate goal carried alongside the primary intent so a
 * natural multi-goal utterance ("noriu parduoti BMW ir pažiūrėk, kiek kainuoja")
 * is not silently flattened into a single action. Carried as a NOTE — never an
 * autonomous action authority (R5 owns execution).
 */
export interface PlannerSecondaryGoal {
  kind: "market_intelligence" | "related_search" | "alternative_suggestion";
  /** Short human-readable note of what the user ALSO wants (audit/telemetry). */
  note: string;
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
  /** R4.2 — related subordinate goal (preserved, not dropped). */
  secondary?: PlannerSecondaryGoal;
  /**
   * R4.2 — the current conversational subject/referent (category-neutral:
   * "BMW", "iPhone 15", "butas Žirmūnuose", "darbas Vilniuje"). The MODEL
   * resolves discourse referents ("kiek TOKS kainuotų?") against conversation
   * context and carries the subject forward; determinism only validates it.
   */
  subject?: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  /** E2.8 — the turn is an ADVICE-seeking turn: catalog search and
   *  search-state mutations are NOT authorized for this turn, regardless of
   *  model tool selection. Enforced at the tool loop. */
  advisoryContext?: boolean;
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
