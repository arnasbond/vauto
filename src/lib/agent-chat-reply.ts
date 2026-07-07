import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import {
  sanitizeAgentReplyForDisplay,
  buildEmptySearchReply,
} from "@/lib/agent-reply-display";
import { buildBrowseAllReply } from "@/lib/browse-all-intent";

const SUPERVISOR_TOOL_NAMES = new Set([
  "applyFilter",
  "clearAllFilters",
  "navigateTo",
  "searchListings",
  "updateUIFilters",
  "navigateToScreen",
]);

export function agentRanSupervisorTools(
  toolCalls?: { name: string }[]
): boolean {
  return Boolean(toolCalls?.some((t) => SUPERVISOR_TOOL_NAMES.has(t.name)));
}

/** One assistant message per agent turn — no stacked fallbacks. */
export function resolveAgentChatReply(input: {
  serverReply?: string;
  actions: VautoAgentAction;
  userQuery: string;
  catalogCount?: number;
  toolCalls?: { name: string }[];
}): string {
  const { serverReply, actions, userQuery, catalogCount, toolCalls } = input;
  const sanitized = sanitizeAgentReplyForDisplay(serverReply ?? "");
  const ranTools = agentRanSupervisorTools(toolCalls);

  if (actions.type === "browse_all") {
    return (
      sanitized ||
      actions.replyMessage ||
      buildBrowseAllReply(actions.listingCount ?? catalogCount)
    );
  }

  if (actions.type === "search" || actions.type === "apply_ui_filters") {
    if (sanitized) return sanitized;
    if (ranTools) {
      return serverReply?.trim() || "Atfiltravau — žiūrėk rezultatus ekrane.";
    }
    return "Atidarau skelbimus ekrane.";
  }

  if (actions.type === "empty_search") {
    return sanitized || buildEmptySearchReply(userQuery);
  }

  return sanitized || serverReply?.trim() || "Atlikta.";
}
