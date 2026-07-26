/** Short chat confirmation — full sales copy stays in PrePublish draftListing.description only. */
export function formatListingDescriptionChatMessage(description: string): string {
  const text = String(description ?? "").trim();
  if (!text) return "";
  return "Aprašymas paruoštas juodraštyje. Peržiūrėk PrePublish lange ir patvirtink, kai viskas tinka.";
}

/** True when assistant text is only the photos/PrePublish gate (no real description body). */
export function isDescriptionGateOnlyReply(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  return /^aprašymas\s+paruoštas[!.,]?\s*ar\s+norite/i.test(t);
}
