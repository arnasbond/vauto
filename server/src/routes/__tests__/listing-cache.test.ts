import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cachePolicyForStatus,
  LISTING_FEED_CACHE,
  LISTING_SINGLE_CACHE,
  NO_STORE,
} from "../listing-cache.js";

describe("F8 — listing cache-header policy", () => {
  it("public cache applies ONLY to successful 200 responses", () => {
    assert.equal(cachePolicyForStatus(LISTING_FEED_CACHE, 200), LISTING_FEED_CACHE);
    assert.equal(cachePolicyForStatus(LISTING_SINGLE_CACHE, 200), LISTING_SINGLE_CACHE);
  });

  it("400 / 404 are no-store", () => {
    assert.equal(cachePolicyForStatus(LISTING_SINGLE_CACHE, 400), NO_STORE);
    assert.equal(cachePolicyForStatus(LISTING_SINGLE_CACHE, 404), NO_STORE);
    assert.equal(cachePolicyForStatus(LISTING_FEED_CACHE, 400), NO_STORE);
  });

  it("5xx are no-store", () => {
    assert.equal(cachePolicyForStatus(LISTING_FEED_CACHE, 500), NO_STORE);
    assert.equal(cachePolicyForStatus(LISTING_SINGLE_CACHE, 503), NO_STORE);
  });

  it("feed and single policies differ but are both public", () => {
    assert.notEqual(LISTING_FEED_CACHE, LISTING_SINGLE_CACHE);
    assert.ok(LISTING_FEED_CACHE.startsWith("public,"));
    assert.ok(LISTING_SINGLE_CACHE.startsWith("public,"));
  });
});
