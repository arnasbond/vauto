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
          `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"/><title>Skelbimas nerastas - VAUTO</title><meta name="robots" content="noindex"/></head><body><p>Skelbimas nerastas. <a href="${origin}/">Grįžti į VAUTO</a></p></body></html>`
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
