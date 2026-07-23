import type { VautoAgentContext } from "@/lib/vauto-agent-client";
import { USER_BEHAVIOR_MAX_EVENTS } from "@/lib/user-behavior-types";

/** Keep agent POST bodies under platform limits (Vercel ~4.5MB, safe target much lower). */
export const AGENT_MAX_MESSAGES = 8;
export const AGENT_MAX_MESSAGE_CHARS = 12_000;
export const AGENT_MAX_LISTINGS = 48;
export const AGENT_MAX_LISTING_DESC_CHARS = 160;
/**
 * Preserve every attached vision URL for Gemini (http + data), up to 10.
 * Do NOT drop data-URL tech passports when some car photos are already http —
 * that previously truncated the set and broke OCR fields A/B/D.3/P.1/P.3.
 */
const AGENT_VISION_URLS_PER_POST = 10;

function selectVisionUrlsForAgentPost(urls: string[]): string[] {
  if (!urls.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (!u || seen.has(u)) continue;
    const isHttp = u.startsWith("http://") || u.startsWith("https://");
    if (!isHttp && !u.startsWith("data:")) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= AGENT_VISION_URLS_PER_POST) break;
  }
  return out;
}

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

  if (context?.behaviorHistory?.length) {
    context = {
      ...context,
      behaviorHistory: context.behaviorHistory.slice(-USER_BEHAVIOR_MAX_EVENTS),
    };
  }

  // Cap image payloads for the agent POST (single Gemini context, ≤10).
  if (context) {
    const pendingAll = (context.pendingImageUrls ?? [])
      .filter(Boolean)
      .slice(0, AGENT_VISION_URLS_PER_POST);
    const draftAll = (context.listingDraft?.orderedImageUrls ?? [])
      .filter(Boolean)
      .slice(0, AGENT_VISION_URLS_PER_POST);
    const totalCount =
      context.pendingImageCount ||
      Math.max(pendingAll.length, draftAll.length) ||
      0;
    const vision = selectVisionUrlsForAgentPost(
      pendingAll.length ? pendingAll : draftAll
    );

    let next = context;
    if (pendingAll.length || draftAll.length) {
      next = {
        ...next,
        pendingImageUrls: vision.length ? vision : undefined,
        pendingImageCount: totalCount || undefined,
      };
    }
    if (next.listingDraft?.orderedImageUrls?.length) {
      next = {
        ...next,
        listingDraft: {
          ...next.listingDraft,
          // Keep http thumbnails only; data URLs stay on the client draft.
          orderedImageUrls: selectVisionUrlsForAgentPost(
            next.listingDraft.orderedImageUrls.filter(Boolean)
          ),
        },
      };
    }
    context = next;
  }

  return {
    ...body,
    messages: messages.length ? messages : body.messages?.slice(-1) ?? [],
    context,
  };
}
