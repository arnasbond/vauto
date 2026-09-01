import type { AgentMessage, VautoAgentRequest } from "./vauto-agent.js";
import {
  sanitizePromptUserInput,
  scrubPromptInjection,
} from "../shared/prompt-injection.js";
import { truncateTextSafely } from "../shared/text-truncation.js";
import {
  sanitizeListingDescription,
  sanitizeListingTitle,
} from "./listing-context-sanitizer.js";

export const AGENT_MAX_MESSAGES = 32;
export const AGENT_MAX_MESSAGE_CHARS = 12_000;
export const AGENT_MAX_LISTINGS = 48;
/** Description budget now enforced by `listing-context-sanitizer.ts` (same value). */
export const AGENT_MAX_LISTING_DESC_CHARS = 160;
export const AGENT_MAX_MY_LISTINGS = 24;
/** Cap client-supplied pendingDocuments.text (L-03). */
export const AGENT_MAX_PENDING_DOCUMENT_TEXT_CHARS = 20_000;

// F1.2 — canonical shared word-boundary truncation (client and server).
function capText(text: string, max: number): string {
  return truncateTextSafely(text, max);
}

/**
 * Sanitize client chat history (H-02 — strict user-only):
 * Accept ONLY role === "user". Drop assistant / system / model / tool spoofing.
 * Client must never inject assistant content into Gemini history.
 */
export function sanitizeAgentMessages(
  raw: unknown[] | undefined | null
): AgentMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentMessage[] = [];
  for (const item of raw.slice(-AGENT_MAX_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const roleRaw = String((item as { role?: unknown }).role ?? "")
      .trim()
      .toLowerCase();
    // Strict: client may only send user turns.
    if (roleRaw !== "user") continue;
    const capped = capText(
      String((item as { text?: unknown }).text ?? ""),
      AGENT_MAX_MESSAGE_CHARS
    );
    if (!capped) continue;
    const { text, blocked } = sanitizePromptUserInput(capped);
    if (blocked || !text) continue;
    out.push({ role: "user", text });
  }
  return out;
}

export function trimVautoAgentRequest(req: VautoAgentRequest): VautoAgentRequest {
  const messages = sanitizeAgentMessages(req.messages as unknown as unknown[]);
  // If scrub emptied history, keep last raw text as USER only — never restore assistant.
  let finalMessages = messages;
  if (!finalMessages.length) {
    const last = (req.messages ?? []).slice(-1)[0];
    const raw = capText(String(last?.text ?? ""), AGENT_MAX_MESSAGE_CHARS);
    const scrubbed = scrubPromptInjection(raw) || "[tuščia]";
    finalMessages = [
      { role: "user", text: scrubbed.slice(0, AGENT_MAX_MESSAGE_CHARS) },
    ];
  }

  const listings = req.context?.listings;
  // F1.1 — client-provided listing titles/descriptions are untrusted data in
  // model context; both pass the centralized listing-context sanitizer (the
  // same boundary DB-driven paths use), keeping one budget everywhere.
  const trimmedListings = listings?.length
    ? listings.slice(0, AGENT_MAX_LISTINGS).map((l) => ({
        ...l,
        title: sanitizeListingTitle(l.title),
        description: l.description
          ? sanitizeListingDescription(l.description)
          : undefined,
      }))
    : listings;

  const myListings = req.context?.myListings?.slice(0, AGENT_MAX_MY_LISTINGS);

  const pendingDocuments = req.context?.pendingDocuments?.length
    ? req.context.pendingDocuments.slice(0, 5).map((d) => {
        const rawText = String(d?.text ?? "");
        const capped = rawText.slice(0, AGENT_MAX_PENDING_DOCUMENT_TEXT_CHARS);
        const scrubbed = sanitizePromptUserInput(capped).text;
        return {
          ...d,
          fileName: capText(String(d?.fileName ?? "dokumentas"), 200),
          text: scrubbed || undefined,
        };
      })
    : req.context?.pendingDocuments;

  const context = {
    ...req.context,
    listings: trimmedListings,
    myListings,
    pendingDocuments,
  };

  // Client only attaches pendingImageUrls on the upload turn. Preserve the full
  // multi-image array so Vision / scanListingPhotos can analyze every photo.

  return {
    ...req,
    messages: finalMessages,
    context,
  };
}
