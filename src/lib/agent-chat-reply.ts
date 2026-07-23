import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import {
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import { buildBrowseAllReply } from "@/lib/browse-all-intent";
import { isGenericFallbackAgentText } from "@/lib/agent-chat-layout";
import { resolveAgentDisplayQuery } from "@/lib/agent-display-query";
import {
  buildEmptySearchWishlistMessage,
  isEmptySearchWishlistCta,
} from "@/lib/matching-service";

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
  const { serverReply, actions, catalogCount, toolCalls } = input;
  const sanitized = sanitizeAgentReplyForDisplay(serverReply ?? "");
  const ranTools = agentRanSupervisorTools(toolCalls);
  const serverText = serverReply?.trim() ?? "";

  if (actions.type === "empty_search") {
    const q =
      resolveAgentDisplayQuery(actions.filters, actions.searchQuery) ||
      input.userQuery;
    if (sanitized && isEmptySearchWishlistCta(sanitized)) return sanitized;
    if (serverText && isEmptySearchWishlistCta(serverText)) return serverText;
    return buildEmptySearchWishlistMessage(q);
  }

  if (serverText && !isGenericFallbackAgentText(sanitized || serverText)) {
    return sanitized || serverText;
  }

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
      return serverText || "Atfiltravau — žiūrėk rezultatus ekrane.";
    }
    return "Atidarau skelbimus ekrane.";
  }

  return sanitized || serverText || "Atlikta.";
}
