/**
 * E2.8 CLIENT AUTHORITY FIX — RAW USER TEXT IS NOT SEARCH AUTHORIZATION.
 *
 * The homepage/AiCommandBar pipeline must materialize search state
 * (canonical query, facet chips, marketplace filters, catalog grid,
 * results scroll, wanted/wishlist empty-state) ONLY from a server-
 * authorized action outcome for the CURRENT turn.
 *
 * Server authority signal (narrowest available):
 *   - `actions.type !== "none"` → server-authorized action (search,
 *     empty_search, apply_ui_filters, browse_all, wanted, ...)
 *   - `actions.type === "none"` → server explicitly granted NO authority
 *     (advisory/context_question) — conversational reply only
 *   - no action at all → no authority; AI-down/error fallbacks must not
 *     manufacture catalog search from raw text when the text is advisory
 *
 * MODEL TOOL SELECTION IS NOT AUTHORIZATION.
 * CLIENT INTERPRETATION IS NOT AUTHORIZATION.
 * RAW USER TEXT IS NOT EXECUTION AUTHORIZATION.
 */
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { isClientAdvisoryQuery } from "@/lib/gemini-search-intent";

/** Agent turn outcome as observed by the AiCommandBar commit pipeline. */
export interface CommandTurnOutcome {
  actions?: VautoAgentAction | null;
  ok: boolean;
  reply?: string | null;
}

export type CommandAuthorityPath = "conductor" | "legacy";

export interface CommandMaterializationDecision {
  /** Server-authorized action to apply (syncGridFromAgentActions). */
  applyActions: VautoAgentAction | null;
  /** Write the raw command text into canonical search query state. */
  persistQuery: boolean;
  /** Scroll/navigate to the results surface. */
  scrollToResults: boolean;
  /** Clear the draft input (conversational outcome). */
  clearDraftOnly: boolean;
  /** Degrade to deterministic facet search (AI down/error) — genuine
   *  search intent only, never advisory. */
  deterministicFallback: boolean;
}

const NO_MATERIALIZATION: CommandMaterializationDecision = {
  applyActions: null,
  persistQuery: false,
  scrollToResults: false,
  clearDraftOnly: false,
  deterministicFallback: false,
};

/**
 * Resolve what the client may do with the current turn's outcome.
 *
 * Semantics preserved for every pre-existing behavior EXCEPT the
 * E2.8 authority fix:
 *   1. `actions.type === "none"` → conversational only (no query write,
 *      no scroll, no fallback, no facet/grid/wanted materialization).
 *   2. AI-down/error without a server signal → deterministic search
 *      ONLY for non-advisory text.
 */
export function resolveCommandMaterialization(
  outcome: CommandTurnOutcome,
  query: string,
  path: CommandAuthorityPath
): CommandMaterializationDecision {
  const actions = outcome.actions ?? null;
  const advisory = isClientAdvisoryQuery(query);

  if (actions) {
    if (actions.type === "none") {
      return {
        ...NO_MATERIALIZATION,
        clearDraftOnly: outcome.ok,
      };
    }
    return {
      applyActions: actions,
      persistQuery: true,
      scrollToResults: path === "conductor",
      clearDraftOnly: false,
      deterministicFallback: false,
    };
  }

  if (outcome.ok) {
    return {
      ...NO_MATERIALIZATION,
      scrollToResults: path === "conductor" && !advisory,
      clearDraftOnly: path === "legacy",
    };
  }

  if (outcome.reply) {
    return {
      ...NO_MATERIALIZATION,
      scrollToResults: path === "legacy" && !advisory,
    };
  }

  return {
    ...NO_MATERIALIZATION,
    deterministicFallback: !advisory,
  };
}
