/**
 * Check HTTP status of unique Unsplash URLs in catalog.
 * Run: node scripts/check-unsplash-urls.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "src/data/lithuania-mock-catalog.ts");
const src = readFileSync(catalogPath, "utf8");

const urls = [...new Set([...src.matchAll(/"image":\s*"([^"]+)"/g)].map((m) => m[1]))];
console.log(`Unique image URLs: ${urls.length}`);

const broken = [];
for (const url of urls) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (!res.ok) {
      broken.push({ url, status: res.status });
      console.log(`FAIL ${res.status} ${url}`);
    }
  } catch (e) {
    broken.push({ url, status: String(e) });
    console.log(`ERR ${url}`);
  }
}

console.log(`\nBroken: ${broken.length}/${urls.length}`);
process.exit(broken.length > 0 ? 1 : 0);
