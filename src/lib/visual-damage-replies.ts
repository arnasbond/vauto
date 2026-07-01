import type { AiExtractedListing } from "@/lib/types";

const DAMAGE_INCLUDE_RE = /^taip,?\s*įtrauk/i;
const DAMAGE_SKIP_RE = /^ne,?\s*praleisti$/i;

export function isVisualDamagePendingDraft(
  draft: AiExtractedListing | null | undefined
): boolean {
  return draft?.attributes?.visualDamagePending === "true";
}

export function isVisualDamageIncludeReply(text: string): boolean {
  return DAMAGE_INCLUDE_RE.test(text.trim());
}

export function isVisualDamageSkipReply(text: string): boolean {
  return DAMAGE_SKIP_RE.test(text.trim());
}

function stripConditionFromDescription(description: string, conditionNote?: string): string {
  const note = conditionNote?.trim();
  if (!note || !description.includes(note)) return description;
  return description
    .replace(`Būklės pastaba: ${note}`, "")
    .replace(note, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Handle „Taip, įtrauk“ / „Ne, praleisti“ after visual damage prompt. */
export function tryHandleVisualDamageReply(
  text: string,
  draft: AiExtractedListing | null,
  updateDraft: (patch: Partial<AiExtractedListing>) => void
): string | null {
  if (!isVisualDamagePendingDraft(draft) || !draft) return null;

  const prevAttrs = draft.attributes ?? {};
  const conditionNote = String(prevAttrs.conditionNote ?? "").trim();

  if (isVisualDamageIncludeReply(text)) {
    updateDraft({
      attributes: {
        ...prevAttrs,
        visualDamagePending: undefined,
        isDamageVerified: "true",
      },
    });
    return "Puiku — defektų aprašymą įtraukiau. Galite peržiūrėti ir patikslinti.";
  }

  if (isVisualDamageSkipReply(text)) {
    const nextDescription = stripConditionFromDescription(
      draft.description?.trim() ?? "",
      conditionNote
    );
    const rest = { ...prevAttrs };
    delete rest.conditionNote;
    delete rest.visualDamagePending;
    updateDraft({
      description: nextDescription || draft.description,
      attributes: {
        ...rest,
        isDamageVerified: "false",
      },
    });
    return "Gerai, defektų neįtrauksiu — galite tęsti skelbimo užpildymą.";
  }

  return null;
}
