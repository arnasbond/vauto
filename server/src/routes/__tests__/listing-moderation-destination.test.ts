import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listingUrl } from "../../push/listing-moderation-notify.js";

describe("P2 — listing moderation notification destinations", () => {
  const listing = {
    id: "lst-abc-123",
    slug: "audi-a6-2020",
    title: "Audi A6",
    sellerId: "seller-789",
  } as any;

  it("listing_rejected routes directly to seller dashboard /mano-skelbimai/?id=...", () => {
    const url = listingUrl(listing, "listing_rejected");
    assert.equal(url, "/mano-skelbimai/?id=lst-abc-123");
  });

  it("listing_pending_review routes directly to seller dashboard /mano-skelbimai/?id=...", () => {
    const url = listingUrl(listing, "listing_pending_review");
    assert.equal(url, "/mano-skelbimai/?id=lst-abc-123");
  });

  it("listing_approved routes to public listing page", () => {
    const url = listingUrl(listing, "listing_approved");
    assert.equal(url, "/listing/audi-a6-2020/");
  });

  it("default routes to public listing page", () => {
    const url = listingUrl(listing);
    assert.equal(url, "/listing/audi-a6-2020/");
  });

  it("encodes special characters in listing id", () => {
    const weirdListing = { id: "item with spaces/symbols", title: "Test" } as any;
    const url = listingUrl(weirdListing, "listing_rejected");
    assert.equal(url, "/mano-skelbimai/?id=item%20with%20spaces%2Fsymbols");
  });
});
