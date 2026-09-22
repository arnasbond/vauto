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
  type ProvenanceSource,
  type Provenance,
  type HardConstraints,
} from "../ai-core-v2/state/marketplace-state.js";
import type { ResultContext } from "../ai-core-v2/journey/result-context.js";
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
 * Allowed Core v2 provenance sources — the ONLY values that may appear in
 * persisted provenance entries. Arbitrary strings cannot become authority.
 */
const VALID_PROVENANCE_SOURCES: ReadonlySet<string> = new Set([
  "USER_STATED",
  "MODEL_INFERRED",
  "TOOL_DERIVED",
  "VISION_DERIVED",
  "DOCUMENT_DERIVED",
]);

/**
 * Runtime-validate a single Provenance entry from persisted JSON.
 * Returns null if the entry is structurally invalid — fail closed.
 */
function validateProvenance(raw: unknown): Provenance | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.source !== "string" || !VALID_PROVENANCE_SOURCES.has(p.source)) return null;
  if (typeof p.at !== "string" || !p.at) return null;
  return {
    source: p.source as ProvenanceSource,
    ...(typeof p.confidence === "number" ? { confidence: p.confidence } : {}),
    at: p.at,
  };
}

/**
 * Deserialize Core v2 MarketplaceState from thread persistence (fail-closed).
 *
 * Every authority-bearing field is runtime-validated — TypeScript casts alone
 * are NOT sufficient for persisted JSON. In particular:
 * - Hard constraint values must match canonical keys and expected types.
 * - Hard constraint provenance must use an allowed ProvenanceSource.
 * - A hard constraint WITHOUT valid provenance is dropped (no orphan authority).
 * - pendingAction must have string type + description.
 * - Soft preferences / exclusions must have valid provenance.
 * Malformed/arbitrary persisted JSON cannot manufacture execution authority.
 */
function deserializeCoreV2State(data: unknown): MarketplaceState {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return emptyMarketplaceState();
  }
  const obj = data as Record<string, unknown>;

  // --- Hard constraints: validate canonical keys and value types ---
  const rawConstraints = typeof obj.hardConstraints === "object" && obj.hardConstraints !== null
    ? obj.hardConstraints as Record<string, unknown>
    : {};
  const rawProvenance = typeof obj.hardConstraintProvenance === "object" && obj.hardConstraintProvenance !== null
    ? obj.hardConstraintProvenance as Record<string, unknown>
    : {};

  const hardConstraints: HardConstraints = {};
  const hardConstraintProvenance: MarketplaceState["hardConstraintProvenance"] = {};

  // Validate each canonical key: value type + valid provenance.
  // A constraint without valid provenance is dropped — no orphan authority.
  if (typeof rawConstraints.category === "string" && rawConstraints.category) {
    const prov = validateProvenance(rawProvenance.category);
    if (prov) {
      hardConstraints.category = rawConstraints.category;
      hardConstraintProvenance.category = prov;
    }
  }
  if (typeof rawConstraints.location === "string" && rawConstraints.location) {
    const prov = validateProvenance(rawProvenance.location);
    if (prov) {
      hardConstraints.location = rawConstraints.location;
      hardConstraintProvenance.location = prov;
    }
  }
  if (typeof rawConstraints.priceMin === "number" && Number.isFinite(rawConstraints.priceMin)) {
    const prov = validateProvenance(rawProvenance.priceMin);
    if (prov) {
      hardConstraints.priceMin = rawConstraints.priceMin;
      hardConstraintProvenance.priceMin = prov;
    }
  }
  if (typeof rawConstraints.priceMax === "number" && Number.isFinite(rawConstraints.priceMax)) {
    const prov = validateProvenance(rawProvenance.priceMax);
    if (prov) {
      hardConstraints.priceMax = rawConstraints.priceMax;
      hardConstraintProvenance.priceMax = prov;
    }
  }

  // --- Soft preferences: validate label + provenance ---
  const softPreferences: MarketplaceState["softPreferences"] = [];
  if (Array.isArray(obj.softPreferences)) {
    for (const entry of obj.softPreferences) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const sp = entry as Record<string, unknown>;
      if (typeof sp.label !== "string" || !sp.label) continue;
      const prov = validateProvenance(sp.provenance);
      if (!prov) continue;
      softPreferences.push({ label: sp.label, provenance: prov });
    }
  }

  // --- Exclusions: validate label + provenance ---
  const exclusions: MarketplaceState["exclusions"] = [];
  if (Array.isArray(obj.exclusions)) {
    for (const entry of obj.exclusions) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const ex = entry as Record<string, unknown>;
      if (typeof ex.label !== "string" || !ex.label) continue;
      const prov = validateProvenance(ex.provenance);
      if (!prov) continue;
      exclusions.push({ label: ex.label, provenance: prov });
    }
  }

  // --- pendingAction: validate structural shape (string type + description) ---
  let pendingAction: MarketplaceState["pendingAction"] = undefined;
  if (typeof obj.pendingAction === "object" && obj.pendingAction !== null && !Array.isArray(obj.pendingAction)) {
    const pa = obj.pendingAction as Record<string, unknown>;
    if (typeof pa.type === "string" && pa.type && typeof pa.description === "string") {
      pendingAction = { type: pa.type, description: pa.description };
    }
  }

  // --- searchSubject provenance ---
  const searchSubjectProvenance = validateProvenance(obj.searchSubjectProvenance) ?? undefined;

  return {
    version: "2.1",
    goal: typeof obj.goal === "string" ? obj.goal : undefined,
    vertical: typeof obj.vertical === "string" ? obj.vertical : undefined,
    searchSubject: typeof obj.searchSubject === "string" ? obj.searchSubject : undefined,
    searchSubjectProvenance,
    hardConstraints,
    hardConstraintProvenance,
    softPreferences,
    exclusions,
    unresolved: Array.isArray(obj.unresolved)
      ? (obj.unresolved as unknown[]).filter((s): s is string => typeof s === "string")
      : [],
    selectedListingIds: Array.isArray(obj.selectedListingIds)
      ? (obj.selectedListingIds as unknown[]).filter((s): s is string => typeof s === "string")
      : [],
    pendingAction,
  };
}

/**
 * Deserialize ResultContext from thread persistence (fail-closed).
 * Validates the minimum structural shape: listings must be an array of objects
 * with at minimum a string `id` field. Falls back to empty ResultContext on
 * any malformed data — never blindly casts arbitrary JSON into trusted state.
 */
function deserializeResultContext(data: unknown): ResultContext {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { listings: [] };
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.listings)) {
    return { listings: [] };
  }
  const validatedListings: ResultContext["listings"] = [];
  for (const entry of obj.listings) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id) continue;
    validatedListings.push({
      id: item.id,
      title: typeof item.title === "string" ? item.title : "",
      price: typeof item.price === "number" ? item.price : 0,
      location: typeof item.location === "string" ? item.location : "",
    });
  }
  return { listings: validatedListings };
}

/**
 * Translate ThreadRecord → BuyerSession.
 *
 * ONLY carries the canonical conversation history (user + assistant turns)
 * and restores server-owned Core v2 state from persistence.
 * Legacy structured state (listingDraft, searchContext) is NOT translated
 * as USER_STATED authority — Core v2 builds authority from the current
 * user turn. Profile/user context is NOT promoted to USER_STATED authority.
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

  // Restore grounded result context from thread persistence if available.
  // Deserialization is fail-closed: malformed data yields empty context.
  const resultContext = deserializeResultContext(thread.coreV2ResultContext);

  // Profile/user context is NOT promoted to USER_STATED authority.
  // Only semantically verified user intent (from the model) may become
  // execution-authoritative. Profile data may be available to reasoning
  // as context if Core v2 supports non-authoritative context, but it
  // MUST NOT silently become a hard constraint.

  return {
    state,
    history,
    resultContext,
  };
}

/**
 * Translate BuyerTurnRecord → VautoAgentResponse.
 *
 * Maps Core v2's decision/response to the legacy contract expected by
 * the frontend. Unsupported capabilities surface as error text.
 * Preserves grounded search result data for UI rendering.
 */
export function buyerTurnRecordToVautoResponse(
  record: BuyerTurnRecord,
  legacyContext: VautoAgentRequest["context"]
): VautoAgentResponse {
  const text =
    record.assistantText.trim() ||
    record.decision.text?.trim() ||
    record.decision.clarification?.trim();
  if (!text) {
    throw new Error("core_v2_empty_visible_response");
  }

  // Map capability calls to legacy toolCalls format with real data.
  const toolCalls = record.capabilityCalls.map((c) => ({
    name: c.name,
    result: c.ok ? c.data : { error: c.error },
  }));

  // Determine legacy action type from Core v2 decision.
  let actionType: "none" | "search" | "listing_draft" = "none";
  let searchSideEffect: { type: "search"; searchQuery: string; listingIds: string[]; filters?: Record<string, unknown> } | null = null;

  const searchCall = record.capabilityCalls.find((c) => c.name === "searchListings" && c.ok);
  if (searchCall && searchCall.data) {
    actionType = "search";
    const searchData = searchCall.data as { count: number; listings: Array<{ id: string }> };
    searchSideEffect = {
      type: "search",
      searchQuery: record.decision.text?.slice(0, 200) || "",
      listingIds: searchData.listings.map((l) => l.id),
      filters: record.stateAfter.hardConstraints as Record<string, unknown>,
    };
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
      coreV2ResultContext: record.resultContext as unknown as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    reply: text,
    toolCalls,
    actions: (searchSideEffect ?? { type: actionType }) as VautoAgentResponse["actions"],
    // Preserve subject for thread persistence.
    subject: record.decision.text?.slice(0, 200),
    // Attach Core v2 state for persistence.
    coreV2State: serializeCoreV2State(record.stateAfter),
    // Attach grounded result context for reference continuity.
    coreV2ResultContext: record.resultContext as unknown as Record<string, unknown>,
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
    throw err;
  }
}

/**
 * Feature flag for Core v2 rollout.
 * Set to false to fall back to legacy Core without code changes.
 */
export const CORE_V2_ENABLED = true;