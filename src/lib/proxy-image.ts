import { getDataApiBaseUrl } from "@/lib/api/config";

const VINTED_IMAGE_HOST_RE =
  /^(images\d*|static-\d+|marketplace-web-assets)\.vinted\.|\.vinted\.(lt|com|net)/i;

function needsVintedProxy(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return VINTED_IMAGE_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/** Route Vinted CDN URLs through our API image proxy to avoid hotlink/CORS blocks. */
export function proxiedImageUrl(externalUrl: string | undefined | null): string {
  const trimmed = externalUrl?.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (!needsVintedProxy(trimmed)) return trimmed;

  const base = getDataApiBaseUrl();
  if (!base) return trimmed;

  return `${base}/api/proxy/image?url=${encodeURIComponent(trimmed)}`;
}
