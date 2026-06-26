/** Lazy combobox filtering — avoids sorting/rendering huge static catalogs on mobile. */

export const COMBOBOX_MAX_VISIBLE = 40;
export const COMBOBOX_LAZY_THRESHOLD = 80;
export const COMBOBOX_MIN_QUERY_LAZY = 2;

export interface ComboboxFilterResult {
  items: string[];
  lazyHint: boolean;
}

export function filterComboboxOptions(
  options: readonly string[],
  query: string,
  currentValue = ""
): ComboboxFilterResult {
  const q = query.trim().toLowerCase();
  const valueNorm = currentValue.trim();
  const isLarge = options.length > COMBOBOX_LAZY_THRESHOLD;
  const lazyHint = isLarge && q.length < COMBOBOX_MIN_QUERY_LAZY;

  if (lazyHint) {
    const keep = valueNorm && options.some((o) => o.trim() === valueNorm) ? [valueNorm] : [];
    return { items: keep, lazyHint: true };
  }

  const seen = new Set<string>();
  const matches: string[] = [];

  const consider = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    if (q && !key.includes(q)) return;
    seen.add(key);
    matches.push(t);
  };

  if (valueNorm) consider(valueNorm);
  for (const opt of options) {
    consider(opt);
    if (matches.length >= COMBOBOX_MAX_VISIBLE * 2) break;
  }

  matches.sort((a, b) => a.localeCompare(b, "lt"));
  return { items: matches.slice(0, COMBOBOX_MAX_VISIBLE), lazyHint: false };
}
