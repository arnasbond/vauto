import type { Request, Response } from "express";
import {
  isAllowedProxyImageUrl,
  upstreamImageReferer,
} from "../lib/external-image-proxy.js";
import { optimizeProxyImageToWebp } from "../lib/proxy-image-optimize.js";
import { logProductionError } from "../lib/production-log.js";

/** GET /api/proxy/image?url=... — bypass marketplace hotlink/CORS for import previews. */
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
        Referer: upstreamImageReferer(target.hostname),
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      logProductionError(
        "image-proxy",
        new Error(`Upstream HTTP ${upstream.status}`),
        { url: target.hostname }
      );
      res.status(502).json({ error: "Upstream image fetch failed" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      res.status(502).json({ error: "Upstream response is not an image" });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    let output: Buffer;
    try {
      output = await optimizeProxyImageToWebp(buffer);
    } catch (convertErr) {
      logProductionError("image-proxy", convertErr, { url: target.hostname });
      res.status(502).json({ error: "Image conversion failed" });
      return;
    }

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Vary", "Accept");
    res.send(output);
  } catch (err) {
    logProductionError("image-proxy", err, { url: raw.slice(0, 120) });
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
}
