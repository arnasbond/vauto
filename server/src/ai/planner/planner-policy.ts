/**
 * E2.1 — DETERMINISTIC POLICY BOUNDARY around the LLM-first planner.
 *
 * The model may propose ANY typed PlannerDecision, but the deterministic
 * layer CLAMPS it before execution:
 *  - schema validation (zod) — malformed output never reaches the pipeline;
 *  - security signals (financial commands, unauthenticated publish) override
 *    the model decision;
 *  - no "everything else = search": a low-confidence catalog decision
 *    without a high-confidence signal degrades to dialog;
 *  - tool names and toolArgs are whitelisted against the registry.
 *
 * Planner intent ≠ permission — enforcement (auth, ownership, readiness,
 * confirmations) stays in the action layer.
 */
import { z } from "zod";
import { extractConditionFromText } from "../../shared/fact-conflict.js";
import { parsePriceFromChatInput } from "../listing-chat-input.js";
import {
  CANCEL_MARKER_RE,
  CONSEQUENTIAL_COMMAND_RE,
  FINANCIAL_COMMAND_RE,
  META_ASSISTANT_QUESTION_RE,
  PUBLISH_INTENT_MARKER_RE,
  SEARCH_VERB_RE,
  isAdvisoryInterrogative,
  isBareAmbiguousNoun,
  isInterrogative,
} from "./planner-signals.js";
import type { PlannerContextInput, PlannerDecision } from "./planner-types.js";

const INTENTS = [
  "catalog_search",
  "sell_create",
  "sell_update",
  "vin_candidate",
  "sell_cancel",
  "sell_preview",
  "context_question",
  "clarify_ambiguous",
  "publish_request",
  "financial_command",
  "consequential_command",
  "ai_down_dialog",
  "dialog",
] as const;

const ROUTINGS = [
  "deterministic_search",
  "deterministic_executor",
  "model",
  "fallthrough",
] as const;

export type PolicyRouting = (typeof ROUTINGS)[number];

/** Tool whitelist the planner may select (the registry it may drive). */
export const PLANNER_TOOL_WHITELIST = [
  "searchListings",
  "updateListingDraft",
  "create_listing_draft",
  "scanListingPhotos",
  "markListingSold",
  "blockListing",
] as const;

/** E2.1 — routing is NEVER model-controlled: the policy layer derives it
 *  from the intent so the model cannot force its own execution path. */
export function deriveRoutingForIntent(
  intent: PlannerDecision["intent"],
  tool: PlannerDecision["tool"]
): PolicyRouting {
  switch (intent) {
    case "catalog_search":
      return tool === "searchListings" ? "deterministic_search" : "model";
    case "sell_create":
    // E2.5 — publish keeps the pre-E2 readiness flow unless the policy
    // clamp explicitly denies (unauthenticated → deterministic_executor).
    case "publish_request":
      return "fallthrough";
    case "context_question":
    case "dialog":
    case "consequential_command":
      return "model";
    default:
      return "deterministic_executor";
  }
}

export const PlannerDecisionSchema = z.object({
  intent: z.enum(INTENTS),
  goal: z.string().max(200).default(""),
  continuationOf: z.enum(["sell_draft", "search_session", "none"]).default("none"),
  action: z.string().max(80).default(""),
  tool: z.enum(PLANNER_TOOL_WHITELIST).nullable().default(null),
  toolArgs: z.record(z.unknown()).default({}),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(300).nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
  reasons: z.array(z.string().max(120)).default([]),
});

/** Financial commands — deterministic security signal, NEVER model-decided. */
const FINANCIAL_COMMAND_RE_LOCAL = FINANCIAL_COMMAND_RE;

export interface PolicyClampResult {
  decision: PlannerDecision;
  clamped: string[];
}

/**
 * E2.1/E2.5 — the deterministic policy boundary. Takes the model's
 * schema-valid decision and returns the decision the pipeline may actually
 * execute. These are POLICY boundaries (authority/anti-hijack), NOT a
 * regex planner: the model still owns open-domain reasoning.
 */
export function applyDeterministicClamps(
  decision: PlannerDecision,
  input: PlannerContextInput
): PolicyClampResult {
  const clamped: string[] = [];
  const text = input.lastUserText;
  const lower = text.toLowerCase();

  // 1. SECURITY OVERRIDES — the model cannot downgrade these.
  if (FINANCIAL_COMMAND_RE_LOCAL.test(text)) {
    clamped.push("financial_command_override");
    return {
      clamped,
      decision: {
        intent: "financial_command",
        goal: "reject financial commands in the assistant surface",
        continuationOf: "none",
        action: "policy_deny_financial",
        tool: null,
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_executor",
        confidence: 1,
        reasons: ["financial_command_pattern", ...decision.reasons.slice(0, 2)],
      },
    };
  }
  if (
    (decision.intent === "publish_request" || PUBLISH_INTENT_MARKER_RE.test(text)) &&
    !input.isAuthenticated
  ) {
    clamped.push("unauth_publish_override");
    return {
      clamped,
      decision: {
        intent: "publish_request",
        goal: "deny publish without authentication",
        continuationOf: decision.continuationOf,
        action: "policy_deny_auth",
        tool: null,
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_executor",
        confidence: 1,
        reasons: ["publish_intent", "unauthenticated", ...decision.reasons.slice(0, 2)],
      },
    };
  }
  // E2.5 — AUTHENTICATED publish must keep the pre-E2 readiness flow: the
  // policy must not let the derived routing trap it into the deny executor.
  if (decision.intent === "publish_request" && input.isAuthenticated) {
    clamped.push("auth_publish_fallthrough");
    decision = { ...decision, routing: "fallthrough" };
  }

  // 2. E2.5/E2.6 — CONSEQUENTIAL recognition is a DETERMINISTIC authority
  //    boundary: the model cannot downgrade a consequential command. The
  //    plan routes through the model tool loop where the confirmation
  //    boundary mints pendingActionId — execution never happens directly.
  if (CONSEQUENTIAL_COMMAND_RE.test(lower)) {
    clamped.push("consequential_command_override");
    const blockTool = /\b(blokuok|užblokuok|ublokuok)\b/i.test(lower);
    const tool = blockTool ? "blockListing" : "markListingSold";

    // E2.6 — resolve the target from CANONICAL state (seller listings).
    // Resolved → a COHERENT plan (needsClarification=false + listingId in
    // toolArgs) so the model proceeds into the confirmation boundary.
    // Genuinely unresolved → clarification stays correct, still no direct
    // mutation (the boundary tool re-checks resolution itself).
    const listings = (input.myListings ?? []).filter((l) => l.status !== "sold");
    const requestedId = String((decision.toolArgs as { listingId?: unknown } | null)?.listingId ?? "").trim();
    const byId = requestedId ? listings.find((l) => l.id === requestedId) : undefined;
    const byActive = input.activeListingId
      ? listings.find((l) => l.id === input.activeListingId)
      : undefined;
    const resolved = byId ?? byActive ?? (listings.length === 1 ? listings[0] : undefined);

    if (resolved) {
      clamped.push("consequential_target_resolved");
      decision = {
        ...decision,
        intent: "consequential_command",
        goal: "consequential command through the confirmation boundary",
        action: "consequential_command",
        tool,
        toolArgs: { listingId: resolved.id } as unknown as PlannerDecision["toolArgs"],
        needsClarification: false,
        clarificationQuestion: null,
        routing: "model",
        confidence: 1,
      };
    } else {
      clamped.push("consequential_target_unresolved");
      decision = {
        ...decision,
        intent: "consequential_command",
        goal: "consequential command through the confirmation boundary",
        action: "consequential_command",
        tool,
        toolArgs: {},
        needsClarification: true,
        clarificationQuestion: "Kurį skelbimą pažymėti?",
        routing: "model",
        confidence: 1,
      };
    }
  }

  // 3. E2.5 — CANCEL with an active draft is understood via the canonical
  //    sell state: the model cannot misread a publish-cancel as search/
  //    dialog.
  if (
    input.hasDraft &&
    CANCEL_MARKER_RE.test(text) &&
    parsePriceFromChatInput(text) == null &&
    !extractConditionFromText(text)
  ) {
    clamped.push("cancel_override");
    return {
      clamped,
      decision: {
        intent: "sell_cancel",
        goal: "keep the draft, publish nothing",
        continuationOf: "sell_draft",
        action: "cancel_publish",
        tool: null,
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_executor",
        confidence: 1,
        reasons: ["cancel_marker", "active_draft", ...decision.reasons.slice(0, 2)],
      },
    };
  }

  // 3b. E2.8 — ADVISORY SEMANTIC CLASS IS A DETERMINISTIC POLICY
  //     BOUNDARY. If the current utterance is advice-seeking
  //     (isAdvisoryInterrogative — a semantic class that already excludes
  //     explicit search verbs), the FINAL decision is ALWAYS advisory:
  //     context_question + model routing + advisoryContext=true. The LLM
  //     planner may contribute reasoning/context but can NEVER override
  //     this class — no clarify buy/sell echo, no catalog fast-path, no
  //     turn with advisoryContext unset. This runs BEFORE the ordinary
  //     intent/routing clamps so every LLM output (clarify_ambiguous,
  //     dialog, context_question, low- or high-confidence catalog_search)
  //     converges to the same advisory decision.
  if (isAdvisoryInterrogative(text)) {
    clamped.push("advisory_interrogative_override");
    return {
      clamped,
      decision: {
        ...decision,
        intent: "context_question",
        goal: "answer an advice-seeking question",
        continuationOf: decision.continuationOf,
        action: "dialog_reply",
        tool: null,
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "model",
        confidence: Math.min(decision.confidence, 0.6),
        reasons: ["advisory_interrogative", ...decision.reasons.slice(0, 2)],
        advisoryContext: true,
      },
    };
  }

  // 4. E2.5 — AMBIGUOUS bare marketplace nouns must NEVER auto-route to
  //    catalog search, regardless of the model's confidence.
  if (
    decision.intent === "catalog_search" &&
    !input.hasDraft &&
    !input.hasSearchSession &&
    isBareAmbiguousNoun(text)
  ) {
    clamped.push("ambiguous_noun_clarify_override");
    return {
      clamped,
      decision: {
        intent: "clarify_ambiguous",
        goal: "disambiguate buy vs sell",
        continuationOf: "none",
        action: "clarify_buy_or_sell",
        tool: null,
        toolArgs: {},
        needsClarification: true,
        clarificationQuestion: `Ar norite „${text}“ pirkti ar parduoti?`,
        routing: "deterministic_executor",
        confidence: 1,
        reasons: ["single_product_noun", "no_verb", ...decision.reasons.slice(0, 2)],
      },
    };
  }

  // 5. NO "everything else = search" — a low-confidence catalog decision
  //    without a high-confidence signal degrades to dialog.
  if (
    decision.intent === "catalog_search" &&
    !SEARCH_VERB_RE.test(lower) &&
    !input.hasSearchSession &&
    decision.confidence < 0.8
  ) {
    clamped.push("low_confidence_search_downgrade");
    decision = {
      ...decision,
      intent: "dialog",
      action: "dialog_reply",
      tool: null,
      routing: "model",
      confidence: Math.min(decision.confidence, 0.4),
    };
  }

  // 5b. E2.6 — INTERROGATIVE normalization: a dialog decision on a QUESTION
  //     (advice/recommendation/context questions) normalizes to
  //     context_question — the semantic class, not a phrase dictionary.
  //     Meta questions about the assistant itself stay dialog; statements
  //     stay dialog; nothing becomes search.
  if (
    decision.intent === "dialog" &&
    isInterrogative(text) &&
    !META_ASSISTANT_QUESTION_RE.test(lower)
  ) {
    clamped.push("interrogative_normalized_context_question");
    decision = { ...decision, intent: "context_question" };
  }

  // 5c. E2.8 — ADVISORY anti-search boundary: advice-seeking utterances
  //     („ką siūlytum?“, „nežinau ko noriu“, „padėk išsirinkti“) must NEVER
  //     become catalog_search, even with category/price/location facets and
  //     high model confidence. The model answers with RECOMMENDATIONS in
  //     text — no search side effect, no hard facets, no wishlist.
  if (
    decision.intent === "catalog_search" &&
    isAdvisoryInterrogative(text)
  ) {
    clamped.push("advisory_interrogative_not_search");
    return {
      clamped,
      decision: {
        ...decision,
        intent: "context_question",
        goal: "answer an advice-seeking question",
        action: "dialog_reply",
        tool: null,
        toolArgs: {},
        needsClarification: decision.needsClarification,
        clarificationQuestion: decision.clarificationQuestion,
        routing: "model",
        confidence: Math.min(decision.confidence, 0.6),
        // E2.8 — turn-level marker: catalog/search-state tools are NOT
        // authorized for this turn (enforced at the tool loop).
        advisoryContext: true,
      },
    };
  }

  // 6. Tool whitelist — unknown tools are dropped (fail-closed to dialog).
  if (decision.tool && !(PLANNER_TOOL_WHITELIST as readonly string[]).includes(decision.tool)) {
    clamped.push("tool_not_in_registry");
    decision = { ...decision, tool: null, routing: "model" };
  }

  // 7. VIN toolArgs require a vehicle draft (VIN authority stays with the
  //    review state machine; a stray vin never reaches a non-vehicle draft).
  const vinArg = (decision.toolArgs as { vin?: unknown } | null)?.vin;
  if (vinArg != null && !(input.hasDraft && /vehicles|transport/.test(String(input.draftCategory ?? "")))) {
    clamped.push("vin_stripped_non_vehicle");
    const nextArgs = { ...decision.toolArgs } as Record<string, unknown>;
    delete nextArgs.vin;
    decision = { ...decision, toolArgs: nextArgs };
  }

  // 8. Consequential tools must route through the model tool loop where the
  //    confirmation boundary enforces pendingActionId (never directly).
  if (
    decision.tool === "markListingSold" ||
    decision.tool === "blockListing"
  ) {
    clamped.push("consequential_routed_to_boundary");
    decision = {
      ...decision,
      routing: "model",
      action: "consequential_command",
    };
  }

  return { decision, clamped };
}
