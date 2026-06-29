const PORTAL_RULES: Array<[RegExp, string]> = [
  [/vinted/i, "Vinted"],
  [/marktplaats/i, "Marktplaats"],
  [/ebay/i, "eBay"],
  [/autoplius/i, "Autoplius"],
  [/aruodas/i, "Aruodas"],
  [/skelbiu/i, "Skelbiu"],
  [/cvbankas/i, "CVbankas"],
  [/depop/i, "Depop"],
  [/poshmark/i, "Poshmark"],
  [/olx/i, "OLX"],
];

export function detectWardrobePortalLabel(url: string): string {
  for (const [pattern, label] of PORTAL_RULES) {
    if (pattern.test(url)) return label;
  }
  return "Spinta";
}

export function shortenProfileUrl(url: string, maxLen = 42): string {
  const trimmed = url.trim();
  if (trimmed.length <= maxLen) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const tail = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const host = parsed.hostname.replace(/^www\./, "");
    const compact = `${host}/…/${tail}`;
    return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen - 1)}…`;
  } catch {
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
}
