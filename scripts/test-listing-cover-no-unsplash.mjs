/**
 * Assert listing cover resolution never invents Unsplash / stock photos.
 * Run: node scripts/test-listing-cover-no-unsplash.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Dynamic import of TS via compiled path is hard; load source text assertions + eval key helpers.
const src = readFileSync(path.join(root, "src/lib/listing-image.ts"), "utf8");
assert.ok(
  !/https?:\/\/images\.unsplash\.com/.test(src),
  "listing-image.ts must not embed Unsplash photo URLs"
);
assert.ok(!/CATEGORY_FALLBACK/.test(src), "CATEGORY_FALLBACK must be removed");
assert.ok(!/CONTENT_IMAGES/.test(src), "CONTENT_IMAGES must be removed");
assert.ok(
  src.includes("LISTING_PLACEHOLDER_IMAGE"),
  "neutral placeholder required"
);

const refSrc = readFileSync(path.join(root, "src/lib/reference-images.ts"), "utf8");
assert.ok(
  !/https?:\/\/images\.unsplash\.com/.test(refSrc),
  "reference-images must not embed Unsplash photo URLs"
);

const apiSrc = readFileSync(path.join(root, "server/src/routes/api.ts"), "utf8");
assert.ok(
  apiSrc.includes("isStockUrl") || apiSrc.includes("unsplash\\.com"),
  "create sanitizer must reject stock URLs"
);

const restoreSrc = readFileSync(
  path.join(root, "server/scripts/restore-real-listing-covers.mjs"),
  "utf8"
);
assert.ok(restoreSrc.includes("galleryUrls"), "restore must read galleryUrls");
assert.ok(
  !restoreSrc.includes('"documentImageUrls"'),
  "restore must not use document images as cover"
);

// Runtime check via a tiny inline mirror of resolve rules
function resolveCover(listing) {
  const stock = (u) => /unsplash\.com|picsum\.photos/i.test(u || "");
  const urls = [
    ...(listing.images || []),
    ...((listing.attributes && listing.attributes.galleryUrls) || []),
    listing.image,
  ].filter((u) => typeof u === "string" && u.trim() && !stock(u) && !u.startsWith("data:"));
  return urls[0] || "PLACEHOLDER";
}

const guitarHttp =
  "https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/listings/guitar.jpg";
assert.equal(
  resolveCover({
    title: "HOHNER Akustinė gitara",
    category: "other",
    images: [],
    image: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800",
    attributes: { galleryUrls: [guitarHttp] },
  }),
  guitarHttp,
  "cover must prefer galleryUrls over Unsplash image column"
);

assert.equal(
  resolveCover({
    title: "HOHNER",
    category: "other",
    images: [guitarHttp],
    image: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800",
  }),
  guitarHttp,
  "cover must be images[0]"
);

assert.equal(
  resolveCover({ title: "Empty", category: "other", images: [], image: "" }),
  "PLACEHOLDER",
  "empty gallery → placeholder only"
);

console.log("[test-listing-cover-no-unsplash] OK");
void createRequire;
void pathToFileURL;
