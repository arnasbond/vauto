/** Force the generated listing description into a normal chat bubble. */
export function formatListingDescriptionChatMessage(description: string): string {
  const text = String(description ?? "").trim();
  if (!text) return "";
  return `Štai tavo aprašymas:\n\n${text}`;
}

/** True when assistant text is only the photos/PrePublish gate (no real description body). */
export function isDescriptionGateOnlyReply(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  return /^aprašymas\s+paruoštas[!.,]?\s*ar\s+norite/i.test(t);
}
