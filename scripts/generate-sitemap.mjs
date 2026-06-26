/**
 * Generates public/sitemap.xml from Lithuania mock catalog (static export).
 * Run: node scripts/generate-sitemap.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SITE_URL = "https://vauto-chi.vercel.app";

const LT_CHAR_MAP = {
  ą: "a", č: "c", ę: "e", ė: "e", į: "i", š: "s", ų: "u", ū: "u", ž: "z",
  Ą: "a", Č: "c", Ę: "e", Ė: "e", Į: "i", Š: "s", Ų: "u", Ū: "u", Ž: "z",
};

function slugify(text) {
  return String(text)
    .split("")
    .map((c) => LT_CHAR_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function listingSlug(listing) {
  if (listing.slug) return listing.slug;
  const city = String(listing.location ?? "").split(",")[0]?.trim() ?? "";
  return [listing.title, city].map(slugify).filter(Boolean).join("-").slice(0, 80);
}

function loadCatalog() {
  const raw = readFileSync(join(root, "src/data/lithuania-mock-catalog.ts"), "utf8");
  const marker = "export const LITHUANIA_MOCK_CATALOG";
  const eq = raw.indexOf("=", raw.indexOf(marker));
  const start = raw.indexOf("[", eq);
  let end = raw.indexOf("] as", start);
  if (end < 0) end = raw.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("Could not parse LITHUANIA_MOCK_CATALOG array");
  return JSON.parse(raw.slice(start, end + 1));
}

const staticPaths = [
  "/",
  "/listing/",
  "/profile/",
  "/add/",
  "/install/",
  "/apie/",
  "/taisykles/",
  "/privatumas/",
  "/registracija/",
];

const catalog = loadCatalog();
const activeListings = catalog.filter((l) => l.status !== "sold" && !l.banned);

const urls = [
  ...staticPaths.map((path) => ({
    loc: `${SITE_URL}${path}`,
    changefreq: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? "1.0" : "0.6",
  })),
  ...activeListings.map((listing) => ({
    loc: `${SITE_URL}/listing/${listingSlug(listing)}/`,
    changefreq: "weekly",
    priority: "0.8",
    lastmod: listing.createdAt?.slice(0, 10),
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

const outPath = join(root, "public/sitemap.xml");
writeFileSync(outPath, xml, "utf8");
console.log(`Wrote ${urls.length} URLs to ${outPath}`);
