import type { VautoAgentAction } from "@/lib/vauto-agent-client";

/** Voice stack removed: kept as an async no-op for legacy call sites. */
export async function completeVoiceTeardown(): Promise<void> {
  return;
}

export function isUiDrivingAgentAction(action: VautoAgentAction): boolean {
  switch (action.type) {
    case "apply_ui_filters":
    case "navigate_to_screen":
    case "search":
    case "empty_search":
    case "browse_all":
    case "navigate":
    case "zero_ui_screen":
      return true;
    default:
      return false;
  }
}
