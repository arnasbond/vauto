/**
 * VAUTO AI Core v2 — capability registry + contract: tools do not decide
 * intent; they only validate + execute + classify consequence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CapabilityRegistry } from "../capability/registry.js";
import { searchListingsCapability } from "../capability/capabilities/search-listings.js";
import { listingDetailsCapability } from "../capability/capabilities/listing-details.js";
import { assertShadowCapabilitiesReadOnly } from "../shadow/shadow-runner.js";
import type { CapabilityContract } from "../capability/capability.js";

describe("Core v2 — capability registry", () => {
  it("registers, lists, and rejects duplicates", () => {
    const r = new CapabilityRegistry();
    r.register(searchListingsCapability);
    r.register(listingDetailsCapability);
    assert.equal(r.has("searchListings"), true);
    assert.equal(r.describe().length, 2);
    assert.throws(() => r.register(searchListingsCapability), /already registered/);
  });

  it("searchListings validates args strictly", () => {
    const ok = searchListingsCapability.validate({ query: "butas", maxPrice: 150000 });
    assert.equal(ok.query, "butas");
    assert.equal(ok.maxPrice, 150000);
    assert.throws(() => searchListingsCapability.validate({ maxPrice: "abc" }));
    assert.throws(() => searchListingsCapability.validate("not-an-object"));
  });

  it("listingDetails validates args strictly", () => {
    assert.deepEqual(listingDetailsCapability.validate({ idOrSlug: "abc-123" }), { idOrSlug: "abc-123" });
    assert.throws(() => listingDetailsCapability.validate({ idOrSlug: "" }));
  });

  it("both initial capabilities are READ-only (no mutation)", () => {
    assert.equal(searchListingsCapability.operation, "READ");
    assert.equal(listingDetailsCapability.operation, "READ");
    assertShadowCapabilitiesReadOnly([searchListingsCapability, listingDetailsCapability]);
  });

  it("a non-READ capability is rejected by the shadow read-only guard", () => {
    const publish: CapabilityContract<unknown, unknown> = {
      name: "publishListing",
      description: "publikuoti",
      operation: "CONSEQUENTIAL",
      validate: () => ({}),
      execute: async () => ({ ok: true }),
    };
    assert.throws(() => assertShadowCapabilitiesReadOnly([publish]), /READ-only/);
  });
});
