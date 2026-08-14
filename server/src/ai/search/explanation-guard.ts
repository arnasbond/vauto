/**
 * Progressive AI explanation guard.
 * Any listingId mentioned in AI text MUST exist in the candidate set — else REJECT.
 * Explanation must never invent listings.
 */

const LISTING_ID_RE =
  /\b(l-[a-z0-9][-a-z0-9]{2,64}|listing[-_]?[a-z0-9][-a-z0-9]{2,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/gi;

export type ExplanationValidation = {
  ok: boolean;
  mentionedIds: string[];
  rejectedIds: string[];
  reason?: string;
};

export function extractMentionedListingIds(text: string): string[] {
  const ids = new Set<string>();
  const re = new RegExp(LISTING_ID_RE.source, LISTING_ID_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text ?? "")))) {
    ids.add(m[1]!.toLowerCase());
  }
  return [...ids];
}

export function validateAiExplanationAgainstCandidates(
  explanationText: string,
  candidateIds: string[]
): ExplanationValidation {
  const allowed = new Set(candidateIds.map((id) => id.toLowerCase()));
  const mentionedIds = extractMentionedListingIds(explanationText);
  const rejectedIds = mentionedIds.filter((id) => !allowed.has(id));
  if (rejectedIds.length) {
    return {
      ok: false,
      mentionedIds,
      rejectedIds,
      reason: "hallucinated_listing_id",
    };
  }
  return { ok: true, mentionedIds, rejectedIds: [] };
}

/**
 * Non-blocking progressive explanation hook.
 * Returns immediately with a promise — callers must not await before rendering results.
 */
export function scheduleAiExplanation(args: {
  candidateIds: string[];
  /** Producer may call an LLM; output is validated before accept. */
  produce: () => Promise<string>;
  onAccepted?: (text: string) => void;
  onRejected?: (reason: string) => void;
}): { explanationPromise: Promise<string | null> } {
  const explanationPromise = (async () => {
    try {
      const text = await args.produce();
      const v = validateAiExplanationAgainstCandidates(text, args.candidateIds);
      if (!v.ok) {
        args.onRejected?.(v.reason ?? "rejected");
        return null;
      }
      args.onAccepted?.(text);
      return text;
    } catch {
      args.onRejected?.("explanation_error");
      return null;
    }
  })();
  return { explanationPromise };
}
