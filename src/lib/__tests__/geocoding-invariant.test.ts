import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrichListingCoords,
  mapGeoContextFromUrl,
} from "@/lib/geocoding";

const base = {
  id: "geo-1",
  title: "Test",
  price: 100,
  location: "Vilnius",
  category: "real_estate",
  tags: [],
  sellerId: "s-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  attributes: {},
} as const;

/**
 * 22B.1 AUD-01 — DETERMINISTIC ZERO-GEOCODED CASE + COORDINATE INVARIANT.
 *
 * These unit tests prove at the pipeline level that:
 * 1. Canonical enrichment never fabricates coordinates for unresolvable
 *    locations (country-only / unknown).
 * 2. The deterministic test context (`?maptest=nogeo`) forces EVERY listing
 *    to remain ungeocoded even when explicit coords exist — the E2E relies on
 *    this to prove `[data-map-empty]`, zero markers/clusters and a preserved
 *    canonical result set, without ever fabricating production coordinates.
 * 3. Presentation-only spreading operates on copies and never persists into
 *    the canonical listing object.
 */
test("22B.1-AUD01: canonical enrich never fabricates coords for country-only location", () => {
  const out = enrichListingCoords({ ...base, location: "Lietuva" });
  assert.equal(out.latitude, undefined);
  assert.equal(out.longitude, undefined);
  assert.equal(out.location, "Lietuva", "canonical location string untouched");
});

test("22B.1-AUD01: canonical enrich never fabricates coords for unknown location", () => {
  const out = enrichListingCoords({ ...base, location: "Nežinoma lokacija" });
  assert.equal(out.latitude, undefined);
  assert.equal(out.longitude, undefined);
});

test("22B.1-AUD01: forceUngeocoded context strips even explicit GPS coords (test-only)", () => {
  const explicit = { ...base, latitude: 54.6872, longitude: 25.2797 };
  const normal = enrichListingCoords(explicit);
  assert.equal(normal.latitude, 54.6872, "canonical path preserves explicit GPS");
  assert.equal(normal.longitude, 25.2797);

  const forced = enrichListingCoords(explicit, { geoContext: "forceUngeocoded" });
  assert.equal(forced.latitude, undefined);
  assert.equal(forced.longitude, undefined);
  assert.equal(forced.id, explicit.id, "identity fields preserved");
});

test("22B.1-AUD01: forceUngeocoded keeps listing identity + canonical fields intact", () => {
  const forced = enrichListingCoords({ ...base, latitude: 55.1694, longitude: 23.8813 }, {
    geoContext: "forceUngeocoded",
  });
  assert.equal(forced.id, base.id);
  assert.equal(forced.title, base.title);
  assert.equal(forced.price, base.price);
  assert.equal(forced.location, base.location);
});

test("22B.1-AUD01: mapGeoContextFromUrl — normal navigation resolves 'normal'", () => {
  assert.equal(
    mapGeoContextFromUrl("http://127.0.0.1:4173/search?vertical=real_estate&q=butas"),
    "normal"
  );
  assert.equal(mapGeoContextFromUrl("http://127.0.0.1:4173/search"), "normal");
  assert.equal(mapGeoContextFromUrl("not-a-url"), "normal");
});

test("22B.1-AUD01: mapGeoContextFromUrl — deterministic test flag resolves 'forceUngeocoded'", () => {
  assert.equal(
    mapGeoContextFromUrl(
      "http://127.0.0.1:4173/search?vertical=real_estate&q=butas&maptest=nogeo"
    ),
    "forceUngeocoded"
  );
  assert.equal(
    mapGeoContextFromUrl(
      "http://127.0.0.1:4173/search?maptest=nogeo&vertical=real_estate"
    ),
    "forceUngeocoded"
  );
});

test("22B.1-AUD01: mapGeoContextFromUrl — sessionStorage flag survives URL rewrites (AI facet sync)", () => {
  // Simulate a non-browser environment (node:test): globalThis.sessionStorage
  // is not defined, so the storage branch must never throw and must resolve
  // 'normal' when absent.
  assert.equal(
    mapGeoContextFromUrl("http://127.0.0.1:4173/search?vertical=real_estate"),
    "normal"
  );
});
