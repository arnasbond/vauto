/**
 * E2 — deterministic server-side PLANNER (single reasoning authority).
 *
 * Decides: what the user wants NOW, whether it continues a prior goal, is a
 * correction, an intent switch, needs a tool (which one), a clarification
 * question, or a plain dialog answer.
 *
 * SECURITY/AUTHORITY is NEVER owned by the planner — the action layer keeps
 * deterministic checks (JWT subject, ownership, admin identity, financial
 * invariants, VIN challenge, fact provenance, schema validation, readiness,
 * consequential confirmations, permissions). The planner only decides
 * ROUTING + REASONING; enforcement stays downstream.
 *
 * Deterministic capabilities (search extraction, field extraction, VIN
 * processing, fact-conflict detection, vision, draft manipulation) remain
 * capabilities invoked when the planner selects them — they NEVER self-trigger
 * on a regex hit for an unrelated turn.
 */
import {
  extractConditionFromText,
} from "../../shared/fact-conflict.js";
import { extractCityFromText } from "../listing-contact-parse.js";
import { parsePriceFromChatInput } from "../listing-chat-input.js";
import { extractVehicleSpecsFromChat } from "../vehicle-attribute-extract.js";
import { isVehicleFamilyCategory } from "../../shared/category-registry.js";
import {
  detectServerSellIntent,
  isSparseSellRequest,
  isJobSeekerListingCreateIntent,
} from "../sell-intent-fallback.js";
import { isPublishReadyIntent } from "../listing-conversational-flow.js";
import { resolveUniversalSearchQuery } from "../search/universal-search-query.js";
import { resolveBrowseAllIntent } from "../../lib/browse-all-intent.js";
// E2.5 — shared policy signals (single vocabulary for the fallback planner
// and the LLM-first policy clamps).
import {
  CANCEL_MARKER_RE,
  CONSEQUENTIAL_COMMAND_RE,
  CORRECTION_MARKER_RE,
  DIALOG_STOPWORD_RE,
  FINANCIAL_COMMAND_RE,
  META_ASSISTANT_QUESTION_RE,
  PUBLISH_INTENT_MARKER_RE,
  QUESTION_MARKER_RE,
  SEARCH_VERB_RE,
  isAdvisoryInterrogative,
  isExplicitWantedRequest,
  productNounScore,
} from "./planner-signals.js";
import type {
  PlannerContextInput,
  PlannerDecision,
  PlannerFactPatch,
  PlannerIntent,
} from "./planner-types.js";

const STRICT_VIN_TOKEN_RE = /^[A-HJ-NPR-Z0-9]{17,18}$/i;

/** Draft preview markers — show the current draft state. */
const PREVIEW_MARKER_RE =
  /\b(parodyk|per[zž]i[uū]r|preview)\b.*\b(?:ką\s+turim|turim|juodrašt|draft)/i;

function hasFactPatch(patch: PlannerFactPatch): boolean {
  return (
    patch.price !== undefined ||
    patch.condition !== undefined ||
    patch.city !== undefined ||
    patch.vin !== undefined
  );
}

function decision(
  intent: PlannerIntent,
  routing: PlannerDecision["routing"],
  patch: Partial<PlannerDecision> = {}
): PlannerDecision {
  return {
    intent,
    goal: "",
    continuationOf: "none",
    action: intent,
    tool: null,
    toolArgs: {},
    needsClarification: false,
    clarificationQuestion: null,
    routing,
    confidence: 1,
    reasons: [],
    ...patch,
  };
}

/**
 * E2.1 — the deterministic planner is the FALLBACK + validation layer.
 * The LLM-first planner (planner-llm.ts) is the primary reasoning source in
 * production; `planTurn` runs when the model decision is unavailable,
 * invalid, or fails schema validation.
 */
export function planTurn(input: PlannerContextInput): PlannerDecision {
  const d = planTurnInner(input);
  if (d.routing !== "model" || input.modelAvailable) {
    return d;
  }
  // E2.1 — AI-down semantics: an OBVIOUS search request keeps the
  // deterministic search capability; everything else gets an HONEST
  // "cannot understand right now" dialog — never a fabricated search.
  if (
    SEARCH_VERB_RE.test(input.lastUserText.toLowerCase()) ||
    resolveBrowseAllIntent(input.lastUserText) ||
    input.hasSearchSession
  ) {
    return {
      ...d,
      routing: "deterministic_search",
      tool: "searchListings",
      reasons: [...d.reasons, "model_unavailable_obvious_search"],
    };
  }
  return {
    ...d,
    intent: "ai_down_dialog",
    action: "ai_down_dialog",
    tool: null,
    routing: "deterministic_executor",
    reasons: [...d.reasons, "model_unavailable_honest_dialog"],
  };
}

function planTurnInner(input: PlannerContextInput): PlannerDecision {
  const text = input.lastUserText.trim();
  const lower = text.toLowerCase();

  // ── 1. SECURITY-adjacent gates (reasoning only; enforcement downstream) ──
  if (FINANCIAL_COMMAND_RE.test(text)) {
    return decision("financial_command", "deterministic_executor", {
      goal: "reject financial commands in the assistant surface",
      action: "policy_deny_financial",
      reasons: ["financial_command_pattern"],
    });
  }
  if (CONSEQUENTIAL_COMMAND_RE.test(lower)) {
    // The model tool loop must run so the confirmation boundary produces the
    // pendingActionId — never a deterministic search hijack.
    return decision("dialog", "model", {
      goal: "consequential command through the confirmation boundary",
      action: "consequential_command",
      reasons: ["consequential_command_pattern"],
      confidence: 0.9,
    });
  }

  const vinToken = text.replace(/^vin[:=]?\s*/i, "").trim();
  const isBareVin = STRICT_VIN_TOKEN_RE.test(vinToken);
  const vehicleDraft = input.hasDraft && isVehicleFamilyCategory(input.draftCategory);

  // ── 2. SELL CONTINUATION — active draft owns the reasoning context ──────
  if (input.hasDraft) {
    if (isBareVin && vehicleDraft) {
      return decision("vin_candidate", "deterministic_executor", {
        goal: "record a VIN candidate through the VIN review state machine",
        continuationOf: "sell_draft",
        action: "update_listing_draft",
        tool: "updateListingDraft",
        toolArgs: { vin: vinToken.toUpperCase() },
        reasons: ["bare_vin_token", "vehicle_draft"],
      });
    }

    const cancelMarker = CANCEL_MARKER_RE.test(text) && !hasFactPatch(extractFacts(text, input));
    if (cancelMarker) {
      return decision("sell_cancel", "deterministic_executor", {
        goal: "keep the draft, publish nothing",
        continuationOf: "sell_draft",
        action: "cancel_publish",
        reasons: ["cancel_marker", "active_draft"],
      });
    }

    if (PREVIEW_MARKER_RE.test(lower)) {
      return decision("sell_preview", "deterministic_executor", {
        goal: "show the current draft state",
        continuationOf: "sell_draft",
        action: "preview_draft",
        reasons: ["preview_marker", "active_draft"],
      });
    }

    if (isPublishReadyIntent(text) || PUBLISH_INTENT_MARKER_RE.test(text)) {
      if (!input.isAuthenticated) {
        return decision("publish_request", "deterministic_executor", {
          goal: "deny publish without authentication",
          action: "policy_deny_auth",
          reasons: ["publish_intent", "unauthenticated"],
        });
      }
      // Authenticated publish keeps the pre-E2 publish/readiness flow.
      return decision("publish_request", "fallthrough", {
        goal: "publish request continues through the readiness gateway",
        continuationOf: "sell_draft",
        action: "publish_request",
        reasons: ["publish_intent", "authenticated"],
      });
    }

    if (QUESTION_MARKER_RE.test(text) && !META_ASSISTANT_QUESTION_RE.test(lower)) {
      return decision("context_question", "model", {
        goal: "answer from canonical state/history",
        continuationOf: "sell_draft",
        action: "dialog_reply",
        reasons: ["question_marker", "active_draft"],
      });
    }

    const switchSearch =
      SEARCH_VERB_RE.test(lower) &&
      (productNounScore(text) > 0 || /\b(būt|but|auto|telefon|dvirat|skelbim)\w*/i.test(lower));
    if (switchSearch) {
      return decision("catalog_search", "model", {
        goal: "honor the explicit intent switch from sell to search",
        continuationOf: "none",
        action: "catalog_search",
        tool: "searchListings",
        reasons: ["search_verb", "active_draft", "intent_switch"],
        confidence: 0.9,
      });
    }

    const facts = extractFacts(text, input);
    if (hasFactPatch(facts)) {
      return decision("sell_update", "deterministic_executor", {
        goal: "apply the corrected facts to the canonical draft",
        continuationOf: "sell_draft",
        action: "update_listing_draft",
        tool: "updateListingDraft",
        toolArgs: facts,
        reasons: ["fact_patch", "active_draft"],
        confidence: 0.95,
      });
    }

    return decision("dialog", "model", {
      goal: "plain dialog continuation on an active draft",
      continuationOf: "sell_draft",
      action: "dialog_reply",
      reasons: ["active_draft_default"],
      confidence: 0.6,
    });
  }

  // ── 3. NO DRAFT ──────────────────────────────────────────────────────────
  if (!detectServerSellIntent(text)) {
    if ((isPublishReadyIntent(text) || PUBLISH_INTENT_MARKER_RE.test(text)) && !input.isAuthenticated) {
      return decision("publish_request", "deterministic_executor", {
        goal: "deny publish without authentication",
        action: "policy_deny_auth",
        reasons: ["publish_intent", "unauthenticated", "no_draft"],
      });
    }

    // E2.8 — ADVISORY anti-search: advice-seeking utterances must never
    // become catalog_search via facet signals. Explicit search verbs keep
    // the search intent.
    if (isAdvisoryInterrogative(text)) {
      return decision("context_question", "model", {
        goal: "answer an advice-seeking question",
        action: "dialog_reply",
        reasons: ["advisory_interrogative"],
        confidence: 0.8,
        advisoryContext: true,
      });
    }

    // E2.8 — EXPLICIT WANTED: a watch/notify-when-available utterance is a
    // first-class capability request, never a catalog search. Mirrors the
    // deterministic policy clamp for the fallback path.
    if (isExplicitWantedRequest(text)) {
      return decision("wanted_registration", "deterministic_executor", {
        goal: "register an explicit watch/notify requirement",
        action: "create_user_requirement",
        reasons: ["explicit_wanted_request"],
        confidence: 1,
      });
    }

    // E2.1 — high-confidence deterministic fast-paths FIRST (browse-all,
    // structured facets, explicit search verbs). Everything else below is
    // clarification / dialog — never a default search.
    if (resolveBrowseAllIntent(text)) {
      return decision("catalog_search", "deterministic_search", {
        goal: "serve a browse-all request",
        action: "catalog_search",
        tool: "searchListings",
        reasons: ["browse_all_intent"],
        confidence: 0.95,
      });
    }
    const structured = resolveUniversalSearchQuery(text);
    const hasStructuredFacets =
      structured.query.canonicalCategory !== "other" &&
      (Boolean(structured.query.location) ||
        structured.query.priceMin != null ||
        structured.query.priceMax != null);
    if (hasStructuredFacets) {
      return decision("catalog_search", "deterministic_search", {
        goal: "serve a structured facet query",
        action: "catalog_search",
        tool: "searchListings",
        reasons: ["structured_facets"],
        confidence: 0.9,
      });
    }
    if (SEARCH_VERB_RE.test(lower)) {
      return decision("catalog_search", "deterministic_search", {
        goal: "serve an explicit search request",
        continuationOf: input.hasSearchSession ? "search_session" : "none",
        action: "catalog_search",
        tool: "searchListings",
        reasons: ["search_verb"],
        confidence: 0.95,
      });
    }

    // Ambiguous single product noun → ONE clarification question. A price /
    // digit phrase is never a product noun („Kaina 700“ stays a query);
    // dialog stopwords („padėk man“, „aš persigalvojau“) never are either.
    const words = text.split(/\s+/).filter(Boolean);
    const isAmbiguousNoun =
      words.length <= 2 &&
      productNounScore(text) > 0 &&
      !DIALOG_STOPWORD_RE.test(lower) &&
      !QUESTION_MARKER_RE.test(text) &&
      !/\d/.test(text) &&
      !/\b(kaina|eur|€|kainos)\b/i.test(lower);
    if (isAmbiguousNoun) {
      return decision("clarify_ambiguous", "deterministic_executor", {
        goal: "disambiguate buy vs sell",
        action: "clarify_buy_or_sell",
        needsClarification: true,
        clarificationQuestion: `Ar norite „${text}“ pirkti ar parduoti?`,
        reasons: ["single_product_noun", "no_verb"],
      });
    }

    if ((QUESTION_MARKER_RE.test(text) || /\?\s*$/.test(text)) && !META_ASSISTANT_QUESTION_RE.test(lower)) {
      return decision("context_question", "model", {
        goal: "answer a state/history question",
        continuationOf: input.hasSearchSession ? "search_session" : "none",
        action: "dialog_reply",
        reasons: ["question_marker", "no_draft"],
      });
    }

    if (CORRECTION_MARKER_RE.test(lower) && input.hasSearchSession) {
      return decision("catalog_search", "model", {
        goal: "apply a search correction through the model tool loop",
        continuationOf: "search_session",
        action: "catalog_search",
        tool: "searchListings",
        reasons: ["correction_marker", "search_session"],
        confidence: 0.9,
      });
    }
  }

  // Explicit sell intent.
  if (detectServerSellIntent(text) || isJobSeekerListingCreateIntent(text)) {
    if (isSparseSellRequest(text)) {
      const isJobSeeker = isJobSeekerListingCreateIntent(text);
      const hasCondition = Boolean(extractConditionFromText(text));
      return decision("sell_create", "deterministic_executor", {
        goal: "sparse sell → skeleton draft + ONE clarification question",
        action: "create_listing_draft",
        needsClarification: !isJobSeeker && !hasCondition,
        clarificationQuestion:
          isJobSeeker || hasCondition ? "" : "Kokios būklės?",
        reasons: ["sell_intent", "sparse"],
      });
    }
    return decision("sell_create", "fallthrough", {
      goal: "full sell text → model + deterministic draft fallback",
      action: "create_listing_draft",
      reasons: ["sell_intent", "non_sparse"],
    });
  }

  // ── E2.1 — search-session refinement fragments keep the deterministic
  // fast-path (high confidence); everything else defaults to dialog.
  if (input.hasSearchSession) {
    return decision("catalog_search", "deterministic_search", {
      goal: "serve a search-session refinement fragment",
      continuationOf: "search_session",
      action: "catalog_search",
      tool: "searchListings",
      reasons: ["search_session_fragment"],
      confidence: 0.9,
    });
  }

  // E2.1 — DEFAULT FAIL-SAFE: unclear intent is dialog/clarification,
  // NEVER "everything else = search".
  return decision("dialog", "model", {
    goal: "open-domain dialog — the model owns the reasoning",
    action: "dialog_reply",
    reasons: ["no_high_confidence_signal"],
    confidence: 0.4,
  });
}

function extractFacts(
  text: string,
  input: PlannerContextInput
): PlannerFactPatch {
  const patch: PlannerFactPatch = {};
  const price = parsePriceFromChatInput(text);
  if (price != null) patch.price = price;
  const condition = extractConditionFromText(text);
  if (condition) patch.condition = condition;
  const city = extractCityFromText(text);
  if (city) patch.city = city;
  if (input.hasDraft && isVehicleFamilyCategory(input.draftCategory)) {
    const specs = extractVehicleSpecsFromChat(text);
    if (specs.vin) patch.vin = specs.vin;
  }
  return patch;
}

/** Search-session continuity: any prior user turn that looked like a search. */
export function detectSearchSession(
  messages: Array<{ role: "user" | "assistant"; text: string }>,
  lastUserText: string
): boolean {
  return messages.some(
    (m) =>
      m.role === "user" &&
      m.text !== lastUserText &&
      (SEARCH_VERB_RE.test(m.text) || productNounScore(m.text) > 0)
  );
}
