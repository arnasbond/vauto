import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";

/** Clean query for the search bar — never inject synthetic „dalys“ suffixes. */
export function resolveAgentDisplayQuery(
  filters?: { query?: string } | null,
  fallbackQuery?: string
): string {
  const raw = filters?.query?.trim() || fallbackQuery?.trim() || "";
  if (!raw) return "";
  let q = stripLegacyCategorySuffixes(raw);
  q = q.replace(/\s+(auto\s+)?dalys$/i, "").trim();
  return q;
}
