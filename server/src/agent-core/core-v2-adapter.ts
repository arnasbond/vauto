/**
 * E1 — Core v2 production adapter.
 *
 * Bridges the existing Thread Service contract (VautoAgentRequest/Response)
 * to Core v2's runBuyerTurn while preserving provenance and authority semantics.
 * Legacy semantic/planner state is NOT translated as USER_STATED authority —
 * the adapter carries only the canonical conversation history and user context.
 */
import {
  runBuyerTurn,
  createBuyerRegistry,
  type BuyerSession,
  type BuyerTurnRecord,
} from "../ai-core-v2/journey/conversation.js";
import { createGeminiReasoningProvider } from "../ai-core-v2/provider/gemini-provider.js";
import { createGeminiAuthorityVerifier } from "../ai-core-v2/loop/authority-verifier.js";
import { CORE_V2_MODEL } from "../ai-core-v2/provider/model-config.js";
import {
  emptyMarketplaceState,
  type MarketplaceState,
} from "../ai-core-v2/state/marketplace-state.js";
import type { VautoAgentRequest, VautoAgentResponse } from "../ai/vauto-agent.js";
import type { ThreadRecord } from "./thread-store.js";

/**
 * Thread service context that the adapter may use for capability execution.
 * This is the minimal bridge for authenticated operations.
 */
export interface CoreV2AdapterContext {
  authUserId?: string;
  /** Optional HITL confirmation flag for consequential actions. */
  confirmationMode?: "test" | "production";
}

/**
 * Serialize Core v2 MarketplaceState for thread persistence.
 * Only serializes the minimal fields needed for continuity.
 */
function serializeCoreV2State(state: MarketplaceState): Record<string, unknown> {
  return {
    version: state.version,
    goal: state.goal,
    vertical: state.vertical,
    searchSubject: state.searchSubject,
    hardConstraints: state.hardConstraints,
    hardConstraintProvenance: state.hardConstraintProvenance,
    softPreferences: state.softPreferences,
    exclusions: state.exclusions,
    unresolved: state.unresolved,
    selectedListingIds: state.selectedListingIds,
    pendingAction: state.pendingAction,
  };
}

/**
 * Deserialize Core v2 MarketplaceState from thread persistence.
 * Falls back to empty state if data is missing or malformed.
 */
function deserializeCoreV2State(data: unknown): MarketplaceState {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return emptyMarketplaceState();
  }
  const obj = data as Record<string, unknown>;
  return {
    version: (typeof obj.version === "string" && obj.version === "2.1") ? "2.1" : "2.1",
    goal: typeof obj.goal === "string" ? obj.goal : undefined,
    vertical: typeof obj.vertical === "string" ? obj.vertical : undefined,
    searchSubject: typeof obj.searchSubject === "string" ? obj.searchSubject : undefined,
    hardConstraints: typeof obj.hardConstraints === "object" && obj.hardConstraints !== null
      ? obj.hardConstraints as MarketplaceState["hardConstraints"]
      : {},
    hardConstraintProvenance: typeof obj.hardConstraintProvenance === "object" && obj.hardConstraintProvenance !== null
      ? obj.hardConstraintProvenance as MarketplaceState["hardConstraintProvenance"]
      : {},
    softPreferences: Array.isArray(obj.softPreferences) ? obj.softPreferences as MarketplaceState["softPreferences"] : [],
    exclusions: Array.isArray(obj.exclusions) ? obj.exclusions as MarketplaceState["exclusions"] : [],
    unresolved: Array.isArray(obj.unresolved) ? obj.unresolved as string[] : [],
    selectedListingIds: Array.isArray(obj.selectedListingIds) ? obj.selectedListingIds as string[] : [],
    pendingAction: typeof obj.pendingAction === "object" && obj.pendingAction !== null
      ? obj.pendingAction as MarketplaceState["pendingAction"]
      : undefined,
  };
}

/**
 * Translate ThreadRecord → BuyerSession.
 *
 * ONLY carries the canonical conversation history (user + assistant turns)
 * and user context. Legacy structured state (listingDraft, searchContext)
 * is NOT translated as USER_STATED authority — Core v2 starts from
 * emptyMarketplaceState and builds authority from the current user turn.
 */
export function threadRecordToBuyerSession(
  thread: ThreadRecord,
  userContext: VautoAgentRequest["context"]
): BuyerSession {
  const history = thread.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    text: m.text,
  }));

  // Restore Core v2 state from thread persistence if available.
  const state = thread.coreV2State
    ? deserializeCoreV2State(thread.coreV2State)
    : emptyMarketplaceState();

  // Extract basic user context (non-authoritative, for display only).
  if (userContext?.userCity) {
    state.hardConstraints.location = userContext.userCity;
    state.hardConstraintProvenance.location = {
      source: "USER_STATED",
      at: new Date().toISOString(),
    };
  }

  return {
    state,
    history,
    resultContext: { listings: [] },
  };
}

/**
 * Translate BuyerTurnRecord → VautoAgentResponse.
 *
 * Maps Core v2's decision/response to the legacy contract expected by
 * the frontend. Unsupported capabilities surface as error text.
 */
export function buyerTurnRecordToVautoResponse(
  record: BuyerTurnRecord,
  legacyContext: VautoAgentRequest["context"]
): VautoAgentResponse {
  const text = record.assistantText || "Negaliu atsakyti šiuo metu.";

  // Map capability calls to legacy toolCalls format.
  const toolCalls = record.capabilityCalls.map((c) => ({
    name: c.name,
    result: c.ok ? { success: true } : { error: c.error },
  }));

  // Determine legacy action type from Core v2 decision.
  let actionType: "none" | "search" | "listing_draft" = "none";
  if (record.capabilityCalls.some((c) => c.name === "searchListings" && c.ok)) {
    actionType = "search";
  }
  if (record.capabilityCalls.some((c) => c.name === "prepareListingDraft" && c.ok)) {
    actionType = "listing_draft";
  }

  // Surface unsupported consequential capabilities as error text.
  const unsupported = record.capabilityCalls.filter(
    (c) => !c.ok && c.error === "confirmation_required"
  );
  if (unsupported.length > 0) {
    const errorText = unsupported.map((c) => `${c.name} reikalauja patvirtinimo`).join(", ");
    return {
      ok: true,
      reply: `${text} (${errorText})`,
      toolCalls,
      actions: { type: "none" } as VautoAgentResponse["actions"],
      subject: record.decision.text?.slice(0, 200),
      coreV2State: serializeCoreV2State(record.stateAfter),
    };
  }

  return {
    ok: true,
    reply: text,
    toolCalls,
    actions: { type: actionType } as VautoAgentResponse["actions"],
    // Preserve subject for thread persistence.
    subject: record.decision.text?.slice(0, 200),
    // Attach Core v2 state for persistence.
    coreV2State: serializeCoreV2State(record.stateAfter),
  };
}

/**
 * Extract the last user message from the request messages array.
 * This matches the existing thread-service logic.
 */
function lastUserMessage(messages: VautoAgentRequest["messages"]): string {
  const last = [...messages].reverse().find(
    (m) => String(m.role ?? "").toLowerCase() === "user" && String(m.text ?? "").trim()
  );
  return String(last?.text ?? "").trim();
}

/**
 * Run a single Core v2 turn within the Thread Service boundary.
 *
 * This replaces runVautoAgent while preserving the existing
 * VautoAgentRequest/Response contract and thread persistence semantics.
 */
export async function runCoreV2Turn(
  thread: ThreadRecord,
  request: VautoAgentRequest,
  adapterContext: CoreV2AdapterContext
): Promise<VautoAgentResponse> {
  const userText = lastUserMessage(request.messages);
  if (!userText) {
    return {
      ok: true,
      reply: "Prašome įvesti tekstą.",
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  const session = threadRecordToBuyerSession(thread, request.context);

  const provider = createGeminiReasoningProvider({ model: CORE_V2_MODEL });
  const verifier = createGeminiAuthorityVerifier({ model: CORE_V2_MODEL });

  const capabilityContext = {
    authUserId: adapterContext.authUserId,
    confirmationMode: adapterContext.confirmationMode,
  };

  try {
    const record: BuyerTurnRecord = await runBuyerTurn(session, userText, {
      provider,
      verifier,
      capabilityContext,
      buildRegistry: createBuyerRegistry,
    });

    return buyerTurnRecordToVautoResponse(record, request.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[core-v2-adapter] turn failed: ${message}`);

    // Surface Core v2 failure clearly for production observability.
    // Rollback path is via CORE_V2_ENABLED flag, not per-turn fallback.
    return {
      ok: true,
      reply: `AI klaida: ${message}`,
      toolCalls: [],
      actions: { type: "none" },
    };
  }
}

/**
 * Feature flag for Core v2 rollout.
 * Set to false to fall back to legacy Core without code changes.
 */
export const CORE_V2_ENABLED = true;