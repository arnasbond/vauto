import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";

const CLIENT_DRAFT_ATTR = "clientDraftId";

function newClientDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable idempotency key for a seller draft — reused across publish retries. */
export function ensureClientDraftId(
  draft: AiExtractedListing
): AiExtractedListing {
  const existing = draft.attributes?.[CLIENT_DRAFT_ATTR];
  if (typeof existing === "string" && existing.trim()) return draft;
  const clientDraftId = newClientDraftId();
  return {
    ...draft,
    attributes: {
      ...(draft.attributes ?? {}),
      [CLIENT_DRAFT_ATTR]: clientDraftId,
    },
  };
}

export function readClientDraftId(
  attributes?: CategoryAttributes | null
): string | undefined {
  const raw = attributes?.[CLIENT_DRAFT_ATTR];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function listingIdFromClientDraftId(clientDraftId: string): string {
  const safe = clientDraftId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48);
  return `l-${safe}`;
}
