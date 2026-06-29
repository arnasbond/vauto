export interface WardrobePortalDef {
  key: string;
  label: string;
  hostPattern: RegExp;
  placeholder: string;
}

export const WARDROBE_PORTALS: WardrobePortalDef[] = [
  {
    key: "skelbiu",
    label: "Skelbiu.lt",
    hostPattern: /skelbiu/i,
    placeholder: "https://www.skelbiu.lt/users/...",
  },
  {
    key: "autoplius",
    label: "Autoplius.lt",
    hostPattern: /autoplius/i,
    placeholder: "https://autoplius.lt/skelbimai/...",
  },
  {
    key: "aruodas",
    label: "Aruodas.lt",
    hostPattern: /aruodas/i,
    placeholder: "https://www.aruodas.lt/...",
  },
  {
    key: "paslaugos",
    label: "Paslaugos.lt",
    hostPattern: /paslaugos/i,
    placeholder: "https://www.paslaugos.lt/...",
  },
  {
    key: "vinted",
    label: "Vinted",
    hostPattern: /vinted\./i,
    placeholder: "https://www.vinted.lt/member/... arba /invite/...",
  },
  {
    key: "marktplaats",
    label: "Marktplaats",
    hostPattern: /marktplaats/i,
    placeholder: "https://www.marktplaats.nl/u/...",
  },
  {
    key: "ebay",
    label: "eBay",
    hostPattern: /ebay\./i,
    placeholder: "https://www.ebay.com/usr/...",
  },
  {
    key: "depop",
    label: "Depop",
    hostPattern: /depop\./i,
    placeholder: "https://www.depop.com/...",
  },
  {
    key: "poshmark",
    label: "Poshmark",
    hostPattern: /poshmark/i,
    placeholder: "https://poshmark.com/closet/...",
  },
  {
    key: "olx",
    label: "OLX",
    hostPattern: /olx\./i,
    placeholder: "https://www.olx.lt/profile/...",
  },
];

const PORTAL_RULES: Array<[RegExp, string]> = WARDROBE_PORTALS.map((p) => [
  p.hostPattern,
  p.label,
]);

export function detectWardrobePortalLabel(url: string): string {
  for (const [pattern, label] of PORTAL_RULES) {
    if (pattern.test(url)) return label;
  }
  return "Portalas";
}

export function detectPortalKey(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    for (const portal of WARDROBE_PORTALS) {
      if (portal.hostPattern.test(host)) return portal.key;
    }
  } catch {
    return null;
  }
  return null;
}

export function isValidPortalUrl(url: string, portalKey?: string): boolean {
  try {
    const trimmed = url.trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const key = portalKey ?? detectPortalKey(trimmed);
    if (!key) return false;
    const portal = WARDROBE_PORTALS.find((p) => p.key === key);
    return Boolean(portal?.hostPattern.test(parsed.hostname));
  } catch {
    return false;
  }
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

export interface UserPortalLinkDto {
  id: string;
  userId: string;
  portalKey: string;
  portalLabel: string;
  profileUrl: string;
  status: "syncing" | "synced" | "error";
  itemCount: number;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
}
