import type { Request, Response } from "express";

const VINTED_IMAGE_HOST_RE =
  /^(images\d*|static-\d+|marketplace-web-assets)\.vinted\.|\.vinted\.(lt|com|net|fr|de|pl|it|es|nl|be|at|cz|sk|hu|ro|gr|hr|fi|dk|se|no|co\.uk|com\.ua)$/i;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (/^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return true;
  return false;
}

export function isAllowedProxyImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    if (isBlockedHost(u.hostname)) return false;
    return VINTED_IMAGE_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

function vintedReferer(hostname: string): string {
  if (/\.lt$/i.test(hostname) || hostname.includes("vinted.lt")) {
    return "https://www.vinted.lt/";
  }
  return "https://www.vinted.com/";
}

/** GET /api/proxy/image?url=... — bypass Vinted hotlink/CORS for wardrobe previews. */
export async function proxyImageHandler(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!raw) {
    res.status(400).json({ error: "url query parameter required" });
    return;
  }

  if (!isAllowedProxyImageUrl(raw)) {
    res.status(403).json({ error: "Image host not allowed" });
    return;
  }

  const target = new URL(raw);

  try {
    const upstream = await fetch(target.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VautoImageProxy/1.0; +https://vauto.app)",
        Referer: vintedReferer(target.hostname),
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream image fetch failed" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      res.status(502).json({ error: "Upstream response is not an image" });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
}
