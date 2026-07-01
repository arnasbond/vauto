import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import type { ConductorIntent, ConductorRequest } from "./types";

function intentForAgentAction(action: VautoAgentAction): ConductorIntent {
  switch (action.type) {
    case "listing_draft":
    case "wardrobe_bulk":
      return "seller_submit";
    case "search":
    case "empty_search":
    case "apply_ui_filters":
    case "navigate_to_screen":
      return "search_query";
    default:
      return "chat";
  }
}

/** Map agent tool output to conductor telemetry request (Phase 1.5). */
export function conductorAgentActionRequest(
  action: VautoAgentAction,
  source: string
): ConductorRequest {
  return {
    intent: intentForAgentAction(action),
    source,
    payload: {
      actionType: action.type,
      fromSearchBar: true,
    },
  };
}
