import { createHash } from "node:crypto";
import { Router } from "express";
import {
  buildListingOgMeta,
  renderListingOgHtml,
  resolveAppOrigin,
} from "../shared/listing-og.js";
import {
  getOgCache,
  invalidateOgCache,
  ogCacheKey,
  setOgCache,
} from "../services/og-cache.js";
import { getPublicListingByIdOrSlug } from "../repository.js";

export const ogRouter = Router();

const BOT_UA =
  /facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|viber|slackbot|discordbot|linkedinbot|pinterest|googlebot|bingbot|applebot|embedly|quora|redditbot|skypeuripreview|vkshare|w3c_validator|ia_archiver|preview/i;

export function isSocialBot(userAgent: string | undefined): boolean {
  return Boolean(userAgent && BOT_UA.test(userAgent));
}

function etagFor(html: string): string {
  return `"${createHash("sha1").update(html).digest("hex").slice(0, 16)}"`;
}

/**
 * GET /og/listing/:idOrSlug
 * Bot-facing HTML with dynamic Open Graph tags.
 * Humans get a near-instant meta refresh to the SPA canonical URL.
 */
ogRouter.get("/listing/:idOrSlug", async (req, res) => {
  const idOrSlug = String(req.params.idOrSlug ?? "").trim();
  if (!idOrSlug || idOrSlug.length > 200) {
    res.status(400).type("html").send("<!doctype html><title>Bad request</title>");
    return;
  }

  const cacheKey = ogCacheKey(idOrSlug);
  const cached = getOgCache(cacheKey);
  if (cached) {
    const inm = req.headers["if-none-match"];
    if (inm && inm === cached.etag) {
      res.status(304).end();
      return;
    }
    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        ETag: cached.etag,
        "X-VAUTO-OG": "hit",
      })
      .send(cached.html);
    return;
  }

  try {
    const listing = await getPublicListingByIdOrSlug(idOrSlug);
    if (!listing) {
      const origin = resolveAppOrigin();
      res
        .status(404)
        .set({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        })
        .send(
          `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"/><title>Skelbimas nerastas - VAUTO</title><meta name="robots" content="noindex"/><meta property="og:title" content="Skelbimas nerastas - VAUTO"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{margin:0;font-family:-apple-system,"Segoe UI",sans-serif;background:#f3f5f9;color:#0b1220;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#ffffff;border:1px solid #e2e7f0;border-radius:20px;box-shadow:0 1px 2px rgba(11,18,32,.05),0 12px 28px -10px rgba(11,18,32,.12);padding:48px 32px;text-align:center;max-width:420px;margin:16px}.brand{font-weight:800;letter-spacing:-0.02em;font-size:20px}.brand span{color:#10b981}h1{font-size:22px;margin:16px 0 8px}p{color:#5b6578;font-size:14px;line-height:1.5;margin:0 0 24px}a{display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px}a:hover{background:#0d9f6e}</style></head><body><div class="card"><div class="brand">VAUTO<span>.</span></div><h1>Skelbimas nerastas</h1><p>Šis skelbimas nebeegzistuoja arba buvo paslėptas pardavėjo.</p><a href="${origin}/">Grįžti į VAUTO</a></div></body></html>`
        );
      return;
    }

    const origin = resolveAppOrigin();
    const meta = buildListingOgMeta(
      {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        priceLabel: listing.priceLabel,
        location: listing.location,
        slug: listing.slug,
        category: listing.category,
        description: listing.description,
        image: listing.image,
        imageTitle: listing.imageTitle,
        attributes: listing.attributes as Record<string, unknown> | undefined,
      },
      origin
    );

    // Bots: stay on document (redirectMs=0 still fine — scrapers read head first).
    // Humans hitting this URL directly: instant redirect to SPA.
    const html = renderListingOgHtml(meta, { redirectMs: 0 });
    const etag = etagFor(html);
    setOgCache(cacheKey, html, etag);
    if (listing.slug) setOgCache(ogCacheKey(listing.slug), html, etag);
    setOgCache(ogCacheKey(listing.id), html, etag);

    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        ETag: etag,
        "X-VAUTO-OG": "miss",
        "X-Robots-Tag": isSocialBot(req.headers["user-agent"])
          ? "index, follow"
          : "noindex",
      })
      .send(html);
  } catch (e) {
    console.error("[og] listing render failed", e);
    res.status(500).type("html").send("<!doctype html><title>Error</title>");
  }
});

/** Call after listing create/update/delete so social previews stay fresh. */
export function bustListingOgCache(listing: {
  id?: string | null;
  slug?: string | null;
}): void {
  const keys = [listing.id, listing.slug].filter(Boolean).map(String);
  invalidateOgCache(keys);
}
