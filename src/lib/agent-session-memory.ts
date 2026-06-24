import type { AgentChatMessage } from "@/lib/vauto-agent-client";

/** Last N chat messages sent to Gemini (~4 user turns). */
export const AGENT_SESSION_MESSAGE_LIMIT = 8;

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  /** Free-text refinements merged into query (spalva, dalys, paslaugos). */
  refinements?: string[];
}

export function selectAgentSessionMessages(
  messages: AgentChatMessage[],
  limit = AGENT_SESSION_MESSAGE_LIMIT
): AgentChatMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

export function mergeSearchFilters(
  previous: AgentSearchFilters | null,
  next: Partial<AgentSearchFilters>
): AgentSearchFilters {
  const refinements = [
    ...(previous?.refinements ?? []),
    ...(next.refinements ?? []),
  ].filter(Boolean);

  const mergedQuery = [next.query ?? previous?.query, ...refinements]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    query: mergedQuery || previous?.query || next.query,
    category: next.category ?? previous?.category,
    city: next.city ?? previous?.city,
    maxPrice: next.maxPrice ?? previous?.maxPrice,
    minPrice: next.minPrice ?? previous?.minPrice,
    refinements: refinements.length ? refinements : undefined,
  };
}

/** Detect short refinement utterances that should inherit prior search filters. */
export function extractSearchRefinement(text: string): string | null {
  const t = text.trim();
  if (t.length > 120) return null;
  if (
    /^(o\s+)?(dab(ar)?\s+)?(rodyk|parodyk|tik|filtruok|palik)\b/i.test(t) ||
    /\b(tik|ir)\s+(pilk|balt|juod|mėlyn|raudon|sidabr|benzin|dyzel)/i.test(t) ||
    /\bspalvos?\b/i.test(t)
  ) {
    return t;
  }
  return null;
}

export function filtersFromSearchAction(action: {
  searchQuery?: string;
  filters?: AgentSearchFilters;
}): AgentSearchFilters | null {
  if (action.filters && Object.keys(action.filters).length) {
    return action.filters;
  }
  if (action.searchQuery?.trim()) {
    return { query: action.searchQuery.trim() };
  }
  return null;
}
