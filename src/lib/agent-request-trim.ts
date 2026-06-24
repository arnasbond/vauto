import type { VautoAgentContext } from "@/lib/vauto-agent-client";

/** Keep agent POST bodies under platform limits (Vercel ~4.5MB, safe target much lower). */
export const AGENT_MAX_MESSAGES = 32;
export const AGENT_MAX_MESSAGE_CHARS = 12_000;
export const AGENT_MAX_LISTINGS = 48;
export const AGENT_MAX_LISTING_DESC_CHARS = 160;

export interface AgentRequestMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AgentRequestBody {
  messages: AgentRequestMessage[];
  context?: VautoAgentContext;
  includeAdminContext?: boolean;
}

function capText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function trimAgentRequestBody<T extends AgentRequestBody>(body: T): T {
  const messages = (body.messages ?? [])
    .slice(-AGENT_MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      text: capText(String(m.text ?? ""), AGENT_MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.text.length > 0);

  let context = body.context;
  if (context?.listings?.length) {
    context = {
      ...context,
      listings: context.listings.slice(0, AGENT_MAX_LISTINGS).map((l) => ({
        ...l,
        description: l.description
          ? capText(l.description, AGENT_MAX_LISTING_DESC_CHARS)
          : undefined,
      })),
    };
  }

  return {
    ...body,
    messages: messages.length ? messages : body.messages?.slice(-1) ?? [],
    context,
  };
}
