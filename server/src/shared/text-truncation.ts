/**
 * F1.2 — ONE canonical truncation for client and server (server mirror).
 *
 * Mirror of `shared/text-truncation.ts` (repo root) per the established
 * server/src/shared mirror convention. KEEP BOTH FILES IN SYNC.
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
