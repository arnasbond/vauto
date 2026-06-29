const BLOCKED_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|metadata\.google\.internal|169\.254\.\d+\.\d+)(:\d+)?$/i;

const PRIVATE_IP_RE = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

const TRUSTED_DIRECT_HOST_RE =
  /(^|\.)cloudinary\.com$|(^|\.)unsplash\.com$|(^|\.)vauto\.(app|lt|com)$|vauto-chi\.vercel\.app$|\.onrender\.com$/i;

export function isBlockedProxyTarget(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOST_RE.test(host)) return true;
  if (host.endsWith(".local")) return true;
  if (PRIVATE_IP_RE.test(host)) return true;
  return false;
}

/** Allow proxying public https images except our own trusted hosts (SSRF guard). */
export function isAllowedProxyImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== "https:") return false;
    if (isBlockedProxyTarget(u.hostname)) return false;
    if (u.pathname.includes("/api/proxy/image")) return false;
    if (TRUSTED_DIRECT_HOST_RE.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function upstreamImageReferer(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host.includes("vinted")) return "https://www.vinted.lt/";
  if (host.includes("marktplaats")) return "https://www.marktplaats.nl/";
  if (host.includes("ebay")) return "https://www.ebay.com/";
  if (host.includes("autoplius")) return "https://www.autoplius.lt/";
  if (host.includes("aruodas")) return "https://www.aruodas.lt/";
  if (host.includes("skelbiu")) return "https://www.skelbiu.lt/";
  if (host.includes("cvbankas")) return "https://www.cvbankas.lt/";
  if (host.includes("olx")) return "https://www.olx.lt/";
  return "https://www.google.com/";
}
