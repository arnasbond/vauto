import { getDataApiBaseUrl } from "@/lib/api/config";
import { SITE_URL } from "@/lib/social-share";

const CLOUDINARY_HOST_RE = /(^|\.)cloudinary\.com$/i;
const UNSPLASH_HOST_RE = /(^|\.)unsplash\.com$/i;

const VAUTO_HOST_RE =
  /(^|\.)vauto\.(app|lt|com)$|(^|\.)vauto-chi\.vercel\.app$|(^|\.)onrender\.com$/i;

/** Known marketplace / portal hosts that block hotlinking — route via image proxy. */
const EXTERNAL_MARKETPLACE_HOST_RE =
  /vinted\.|marktplaats\.|ebay\.|ebayimg\.|autoplius\.|aruodas\.|skelbiu\.|cvbankas\.|allegro\.|depop\.|poshmark\.|mercari\.|subito\.|leboncoin\.|wallapop\.|olx\.|ss\.com|dba\.dk|tori\.fi|blocket\.|tradera\.|ricardo\.|willhaben\.|kleinanzeigen\.|gumtree\.|craigslist\.|facebook\.com|fbcdn\.net/i;

function parseHttpUrl(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

function isOwnProductionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (VAUTO_HOST_RE.test(host)) return true;
  try {
    const siteHost = new URL(SITE_URL).hostname.toLowerCase();
    if (host === siteHost) return true;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && host === window.location.hostname.toLowerCase()) {
    return true;
  }
  const apiBase = getDataApiBaseUrl();
  if (apiBase) {
    try {
      if (host === new URL(apiBase).hostname.toLowerCase()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** URLs safe to load directly in the browser (no hotlink block). */
export function isDirectSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return true;

  const parsed = parseHttpUrl(trimmed);
  if (!parsed) return false;

  const host = parsed.hostname.toLowerCase();
  if (CLOUDINARY_HOST_RE.test(host)) return true;
  if (UNSPLASH_HOST_RE.test(host)) return true;
  if (isOwnProductionHost(host)) return true;
  return false;
}

export function needsImageProxy(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return false;
  }
  if (isDirectSafeImageUrl(trimmed)) return false;

  const parsed = parseHttpUrl(trimmed);
  if (!parsed) return false;

  const host = parsed.hostname.toLowerCase();
  if (EXTERNAL_MARKETPLACE_HOST_RE.test(host)) return true;

  // Any other external https image from import/scrape — proxy by default.
  return parsed.protocol === "https:";
}

function imageProxyBase(): string | null {
  const api = getDataApiBaseUrl();
  if (api) return api.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return null;
}

/**
 * Return a browser-safe image URL.
 * Own / Cloudinary URLs pass through; external marketplace CDN URLs use /api/proxy/image.
 */
export function getSafeImageUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";
  if (!needsImageProxy(trimmed)) return trimmed;

  const base = imageProxyBase();
  if (!base) return trimmed;

  return `${base}/api/proxy/image?url=${encodeURIComponent(trimmed)}`;
}
