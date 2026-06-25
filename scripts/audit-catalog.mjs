#!/usr/bin/env node
/** Pre-release data integrity checks for VAUTO mock catalog. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

const catalogPath = join(root, "src/data/lithuania-mock-catalog.ts");
const catalogSrc = readFileSync(catalogPath, "utf8");
const jsonMatch = catalogSrc.match(
  /export const LITHUANIA_MOCK_CATALOG[^=]*=\s*(\[[\s\S]*\])\s*as (?:Listing|LegacyListingInput)\[\]/
);
if (!jsonMatch) fail("Could not parse LITHUANIA_MOCK_CATALOG");

const listings = JSON.parse(jsonMatch[1]);
if (listings.length !== 100) fail(`Expected 100 listings, got ${listings.length}`);
ok(`Catalog count: ${listings.length}`);

const ids = listings.map((l) => l.id);
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length) fail("Duplicate listing IDs found");
ok("All listing IDs unique");

for (const l of listings) {
  if (!l.title?.trim()) fail(`Missing title: ${l.id}`);
  if (!l.location?.trim()) fail(`Missing location: ${l.id}`);
  if (!l.image?.startsWith("https://")) fail(`Bad image URL: ${l.id}`);
  if (!l.description?.trim()) fail(`Missing description: ${l.id}`);
  if (l.category === "vehicles" && l.price < 1500) fail(`Vehicle price too low: ${l.id}`);
}

ok("Required fields present on all listings");

const cities = new Set(listings.map((l) => l.location));
if (cities.size < 15) fail(`Only ${cities.size} cities — expected broad LT coverage`);
ok(`City coverage: ${cities.size} cities`);

const vehicles = listings.filter((l) => l.category === "vehicles");
const above20k = vehicles.filter((l) => l.price > 20000).length;
ok(`Vehicles: ${vehicles.length}, above 20k€: ${above20k}`);

const requiredCategories = [
  "vehicles",
  "real_estate",
  "jobs",
  "clothing",
  "electronics",
  "home",
  "services",
  "other",
];
for (const cat of requiredCategories) {
  const count = listings.filter((l) => l.category === cat).length;
  if (count < 3) fail(`Category ${cat} has only ${count} listings — need diverse catalog`);
  ok(`Category ${cat}: ${count}`);
}

const refs = [
  ["src/data/mockReviews.ts", ["lt-svc-001", "lt-el-001", "seller-svc-1", "seller-el-1"]],
  ["src/data/mockReports.ts", ["lt-el-001", "lt-el-002", "seller-el-1", "seller-el-2"]],
  ["src/data/mockListings.ts", ["lt-el-001", "chat-1"]],
  ["e2e/smoke.spec.ts", ["bmw-320d-2003-kaunas"]],
];

for (const [file, needles] of refs) {
  const src = readFileSync(join(root, file), "utf8");
  for (const n of needles) {
    if (!src.includes(n)) fail(`${file} missing reference: ${n}`);
  }
  ok(`${file} references valid`);
}

console.log("\nCatalog audit: ALL CHECKS PASSED");
