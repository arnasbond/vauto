import type { AgentMessage, VautoAgentRequest } from "./vauto-agent.js";

export const AGENT_MAX_MESSAGES = 32;
export const AGENT_MAX_MESSAGE_CHARS = 12_000;
export const AGENT_MAX_LISTINGS = 48;
export const AGENT_MAX_LISTING_DESC_CHARS = 160;
export const AGENT_MAX_MY_LISTINGS = 24;

function capText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function trimVautoAgentRequest(req: VautoAgentRequest): VautoAgentRequest {
  const messages: AgentMessage[] = (req.messages ?? [])
    .slice(-AGENT_MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      text: capText(String(m.text ?? ""), AGENT_MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.text.length > 0);

  const listings = req.context?.listings;
  const trimmedListings = listings?.length
    ? listings.slice(0, AGENT_MAX_LISTINGS).map((l) => ({
        ...l,
        description: l.description
          ? capText(l.description, AGENT_MAX_LISTING_DESC_CHARS)
          : undefined,
      }))
    : listings;

  const myListings = req.context?.myListings?.slice(0, AGENT_MAX_MY_LISTINGS);

  return {
    ...req,
    messages: messages.length ? messages : req.messages.slice(-1),
    context: {
      ...req.context,
      listings: trimmedListings,
      myListings,
    },
  };
}
