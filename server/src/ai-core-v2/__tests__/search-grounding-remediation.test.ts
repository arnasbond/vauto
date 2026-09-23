import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tryResolveListingCategoryId,
  getCategoryFamilySlugs,
  isListingCategoryMatch,
} from "../../shared/category-registry.js";
import { searchListingsFiltered } from "../../repository.js";
import { mergeDbListingsWithDemoCatalog } from "../../demo-catalog-api.js";

describe("search grounding remediation", () => {
  it("resolves 'Transportas' to canonical category representation ('vehicles' / 'transport')", () => {
    const resolvedTransportas = tryResolveListingCategoryId("Transportas");
    assert.equal(resolvedTransportas, "transport");

    const familySlugs = getCategoryFamilySlugs("Transportas");
    assert.deepEqual(familySlugs.sort(), ["transport", "vehicles"]);

    const resolvedVehicles = tryResolveListingCategoryId("vehicles");
    assert.equal(resolvedVehicles, "vehicles");

    assert.equal(isListingCategoryMatch("vehicles", "Transportas"), true);
    assert.equal(isListingCategoryMatch("transport", "Transportas"), true);
    assert.equal(isListingCategoryMatch("electronics", "Transportas"), false);
    assert.equal(isListingCategoryMatch("clothing", "Transportas"), false);
    assert.equal(isListingCategoryMatch("home", "Transportas"), false);
  });

  it("returns zero non-transport listings for category=Transportas + maxPrice=20000", async () => {
    const listings = await searchListingsFiltered({
      category: "Transportas",
      maxPrice: 20000,
    });

    assert.ok(listings.length > 0, "expected at least 1 matching transport listing in demo/DB");

    for (const listing of listings) {
      assert.ok(
        isListingCategoryMatch(listing.category, "Transportas"),
        `Listing ${listing.id} (${listing.title}) has category '${listing.category}', expected Transportas family`
      );
      assert.ok(
        listing.price <= 20000,
        `Listing ${listing.id} price ${listing.price} exceeds maxPrice 20000`
      );
      assert.notEqual(listing.category, "electronics");
      assert.notEqual(listing.category, "clothing");
      assert.notEqual(listing.category, "home");
      assert.notEqual(listing.category, "other");
    }
  });

  it("returns empty array [] when zero DB/demo results match authoritative constraints", async () => {
    const listings = await searchListingsFiltered({
      category: "Transportas",
      maxPrice: 10,
    });

    assert.deepEqual(listings, []);
  });

  it("ensures mergeDbListingsWithDemoCatalog obeys search constraints without backfilling unrelated categories", () => {
    const merged = mergeDbListingsWithDemoCatalog([], {
      category: "Transportas",
      maxPrice: 20000,
    });

    assert.ok(merged.length > 0);
    for (const item of merged) {
      assert.ok(
        item.category === "vehicles" || item.category === "transport",
        `unexpected item category ${item.category}`
      );
      assert.ok(item.price <= 20000);
    }
  });
});
