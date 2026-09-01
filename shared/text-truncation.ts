/**
 * F1.2 — ONE canonical truncation for client and server.
 *
 * Both planes must shorten model-bound text with the SAME word-boundary logic
 * (truncate at the last space near the cap, append …; single overlong words
 * fall back to a hard cut). No plane may silently ship its own slice variant.
 */

/** Truncate at a word boundary when one exists near the cap; always append … */
export function truncateTextSafely(text: unknown, maxLen: number): string {
  if (!Number.isFinite(maxLen) || maxLen <= 0) return "";
  const t = String(text ?? "").trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > (maxLen - 1) * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}

/** Bounded JSON serialization of an untrusted block (never throws). */
export function clampJsonBlock(value: unknown, maxChars: number): string {
  try {
    const json = JSON.stringify(value ?? null);
    return truncateTextSafely(json ?? "null", maxChars);
  } catch {
    return "";
  }
}
