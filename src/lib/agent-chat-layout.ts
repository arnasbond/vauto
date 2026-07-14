import type { AgentChatMessage } from "@/lib/vauto-agent-client";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import {
  isProactiveInternalAgentText,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import { resolveAgentDisplayQuery } from "@/lib/agent-display-query";

const BLOCKED_FALLBACK_FRAGMENTS = [
  "šiuo metu neturime",
  "rinkoje neradau",
  "turguje neradau",
  "atsiprašau, ne viską",
  "tiesioginio atitikmens",
  "deja, pagal",
  "nieko tinkamo neradau",
  "nieko neradau",
  "pabandykime kitą frazę",
] as const;

const GENERIC_FALLBACK_RE =
  /^(deja,|šiuo metu|atsiprašau, ne viską|pabandykime kitą frazę|nerasta atitinkančių|rezultat[uų]\s+nerasta)/i;

/** Brutal substring filter — skip stacked legacy fallback bubbles in DOM. */
export function isBlockedFallbackBubble(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (GENERIC_FALLBACK_RE.test(t)) return true;
  return BLOCKED_FALLBACK_FRAGMENTS.some((frag) => t.includes(frag));
}

/** @deprecated use isBlockedFallbackBubble */
export function isGenericFallbackAgentText(text: string): boolean {
  return isBlockedFallbackBubble(text);
}

export function stripGenericFallbackAssistants(
  messages: AgentChatMessage[]
): AgentChatMessage[] {
  return messages.filter(
    (m) =>
      m.role !== "assistant" ||
      !isBlockedFallbackBubble(sanitizeAgentReplyForDisplay(m.text) || m.text)
  );
}

export interface SupervisorChatTurn {
  user: AgentChatMessage | null;
  assistant: AgentChatMessage | null;
}

/** One luxury turn: last user + single consolidated assistant bubble. */
export function resolveSupervisorChatTurn(
  messages: AgentChatMessage[]
): SupervisorChatTurn {
  const visible = messages.filter(
    (m) => !isProactiveInternalAgentText(m.text?.trim() ?? "")
  );

  const lastUser = [...visible].reverse().find((m) => m.role === "user") ?? null;
  const assistants = visible.filter((m) => m.role === "assistant");

  const preferred = [...assistants]
    .reverse()
    .find((m) => {
      const display = sanitizeAgentReplyForDisplay(m.text) || m.text;
      return display.trim() && !isBlockedFallbackBubble(display);
    });

  const assistant = preferred ?? assistants[assistants.length - 1] ?? null;

  if (!assistant) {
    return { user: lastUser, assistant: null };
  }

  const display =
    sanitizeAgentReplyForDisplay(assistant.text) || assistant.text;
  if (!display.trim() || isBlockedFallbackBubble(display)) {
    return { user: lastUser, assistant: null };
  }

  return {
    user: lastUser,
    assistant: {
      role: "assistant",
      text: display,
      ...(assistant.quickReplies?.length
        ? { quickReplies: assistant.quickReplies }
        : {}),
    },
  };
}

/** Strict single-bubble render list for chat strips. */
export function resolveVisibleAgentBubbles(
  messages: AgentChatMessage[]
): AgentChatMessage[] {
  const turn = resolveSupervisorChatTurn(messages);
  const out: AgentChatMessage[] = [];
  if (turn.user) out.push(turn.user);
  if (turn.assistant) out.push(turn.assistant);
  return out;
}

/** True when user has started a home chat turn — hide duplicate top search bar. */
export function isHomeAgentChatActive(
  messages: AgentChatMessage[],
  busy: boolean
): boolean {
  if (busy) return true;
  return messages.some((m) => m.role === "user");
}

/** Embedded agent chat on dashboard / secondary pages (includes assistant-only edit opener). */
export function isEmbeddedAgentChatVisible(
  messages: AgentChatMessage[],
  busy: boolean
): boolean {
  if (busy) return true;
  return messages.some((m) => m.role === "user" || m.role === "assistant");
}

export function agentHasSupervisorReply(messages: AgentChatMessage[]): boolean {
  return Boolean(resolveSupervisorChatTurn(messages).assistant?.text.trim());
}

export type SearchBarSyncPlan =
  | { mode: "clear" }
  | { mode: "set"; query: string }
  | { mode: "skip" };

export function isSyntheticAgentQuery(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return false;
  if (/\bdalys\b/.test(q)) return true;
  if (/\b(auto\s+)?dalys$/.test(q)) return true;
  return false;
}

function hasStructuredMarketplaceFilters(
  filters?: { category?: string; subcategory?: string; city?: string } | null,
  categoryAttributes?: Record<string, string> | null
): boolean {
  const cat = filters?.category?.trim();
  if (cat && cat !== "all") return true;
  if (filters?.subcategory?.trim()) return true;
  if (filters?.city?.trim()) return true;
  if (categoryAttributes && Object.keys(categoryAttributes).length > 0) return true;
  return false;
}

/** Never inject augmented filter strings (e.g. „Volvo dalys“) into the search bar. */
export function resolveSearchBarSyncFromAction(
  action: VautoAgentAction,
  userQuery?: string
): SearchBarSyncPlan {
  if (action.type === "browse_all") return { mode: "clear" };

  if (action.type === "apply_ui_filters") {
    const raw = action.query?.trim() || action.filters?.query?.trim() || "";
    const clean = resolveAgentDisplayQuery(action.filters, raw);
    const structured = hasStructuredMarketplaceFilters(
      action.filters,
      action.categoryAttributes
    );
    if (structured && (!clean || isSyntheticAgentQuery(raw || clean))) {
      return { mode: "clear" };
    }
    if (clean && !isSyntheticAgentQuery(clean)) {
      return { mode: "set", query: clean };
    }
    return { mode: "clear" };
  }

  if (action.type === "search") {
    const clean = resolveAgentDisplayQuery(
      action.filters,
      action.filters?.query?.trim() || action.searchQuery
    );
    if (!clean || isSyntheticAgentQuery(clean)) {
      const userClean = resolveAgentDisplayQuery(null, userQuery);
      if (userClean && !isSyntheticAgentQuery(userClean)) {
        return { mode: "set", query: userClean };
      }
      return { mode: "clear" };
    }
    return { mode: "set", query: clean };
  }

  if (action.type === "empty_search") {
    if (hasStructuredMarketplaceFilters(action.filters, null)) {
      return { mode: "clear" };
    }
    const clean = resolveAgentDisplayQuery(action.filters, action.searchQuery);
    if (!clean || isSyntheticAgentQuery(clean)) return { mode: "clear" };
    return { mode: "set", query: clean };
  }

  if (action.type === "navigate_to_screen" && action.query?.trim()) {
    const clean = resolveAgentDisplayQuery(action.filters, action.query);
    return clean && !isSyntheticAgentQuery(clean)
      ? { mode: "set", query: clean }
      : { mode: "clear" };
  }

  return { mode: "skip" };
}

export function applySearchBarSyncPlan(
  plan: SearchBarSyncPlan,
  setSearchQuery: (q: string) => void
): void {
  if (plan.mode === "clear") setSearchQuery("");
  else if (plan.mode === "set") setSearchQuery(plan.query);
}
