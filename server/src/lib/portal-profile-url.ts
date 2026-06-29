export interface PortalProfileDef {
  key: string;
  label: string;
  hostPattern: RegExp;
}

export const PORTAL_PROFILE_DEFS: PortalProfileDef[] = [
  { key: "skelbiu", label: "Skelbiu.lt", hostPattern: /skelbiu/i },
  { key: "autoplius", label: "Autoplius.lt", hostPattern: /autoplius/i },
  { key: "aruodas", label: "Aruodas.lt", hostPattern: /aruodas/i },
  { key: "paslaugos", label: "Paslaugos.lt", hostPattern: /paslaugos/i },
  { key: "vinted", label: "Vinted", hostPattern: /vinted\./i },
  { key: "marktplaats", label: "Marktplaats", hostPattern: /marktplaats/i },
  { key: "ebay", label: "eBay", hostPattern: /ebay\.|ebayimg\./i },
  { key: "depop", label: "Depop", hostPattern: /depop\./i },
  { key: "poshmark", label: "Poshmark", hostPattern: /poshmark/i },
  { key: "olx", label: "OLX", hostPattern: /olx\./i },
];

export function detectPortalKeyFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    for (const def of PORTAL_PROFILE_DEFS) {
      if (def.hostPattern.test(host)) return def.key;
    }
  } catch {
    return null;
  }
  return null;
}

export function portalLabelForKey(key: string): string {
  return PORTAL_PROFILE_DEFS.find((d) => d.key === key)?.label ?? "Portalas";
}

export function isPortalProfileUrl(url: string, portalKey?: string): boolean {
  try {
    const trimmed = url.trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const key = portalKey ?? detectPortalKeyFromUrl(trimmed);
    if (!key) return false;
    const def = PORTAL_PROFILE_DEFS.find((d) => d.key === key);
    return Boolean(def?.hostPattern.test(parsed.hostname));
  } catch {
    return false;
  }
}
