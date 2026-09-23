/**
 * Deterministic executor fallbacks for Thread Service conversational safety.
 */

/** E2.1 — AI-down honest dialog: never a fabricated search, never success. */
export function executorAiDownReply(query: string): string {
  const q = String(query ?? "").trim();
  return q
    ? `Atsiprašau — AI asistentas laikinai negali suprasti šios užklausos („${q}“). Parašykite konkrečiau, ko norite, arba bandykite kiek vėliau.`
    : "Atsiprašau — AI asistentas laikinai negali suprasti užklausos. Parašykite konkrečiau, ko norite, arba bandykite kiek vėliau.";
}
