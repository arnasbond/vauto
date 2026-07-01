/** Pokalbio sraute vartotojas gali praleisti neprivalomus atributus. */
const SKIP_REPLY_RE =
  /\b(nežinau|nezinau|nesuprantu|neturiu|nėra|nera|praleid|praleisk|praleisti|skip|vėliau|veliau|n\/a|palik tušč|palik tusc|nesvarbu|bet koks)\b/i;

export function isConversationalSkipReply(text: string): boolean {
  return SKIP_REPLY_RE.test(text.trim());
}

export const CONVERSATIONAL_SKIP_QUICK_REPLY = {
  id: "attr-skip",
  label: "Nežinau / praleisti",
  attributePatch: {},
} as const;

export function conversationalSkipAck(fieldLabel?: string): string {
  return fieldLabel
    ? `Gerai, „${fieldLabel}" galite pridėti vėliau — tęsiame.`
    : "Gerai, praleidžiame — galite užbaigti skelbimą bet kada.";
}
