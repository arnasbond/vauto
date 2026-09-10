/**
 * FAIL-FIRST — explicit client surface ownership (DF-LIVE-2).
 *
 * SELL/CREATE must own the visible surface: when a listing draft exists or a
 * seller step is active, the catalog search scaffold must be suppressed. This
 * is surface visibility, not state deletion — catalog state is preserved for
 * SELL → SEARCH return.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveActiveSurface,
  catalogSurfaceVisible,
  type ActiveSurface,
} from "@/lib/ai-surface-ownership";

function resolve(o: Partial<{ sellerStep: string; hasListingDraft: boolean; searchQuery: string }>): ActiveSurface {
  return resolveActiveSurface({
    sellerStep: "idle",
    hasListingDraft: false,
    searchQuery: "",
    ...o,
  });
}

describe("surface ownership — SELL/CREATE owns the visible surface", () => {
  it("active listing draft → sell_create (catalog suppressed)", () => {
    assert.equal(resolve({ hasListingDraft: true }), "sell_create");
  });

  it("seller wizard step → sell_create", () => {
    for (const s of ["recording", "processing", "confirmation", "published"]) {
      assert.equal(resolve({ sellerStep: s }), "sell_create", s);
    }
  });

  it("catalog surface is hidden for sell_create", () => {
    assert.equal(catalogSurfaceVisible("sell_create"), false);
    assert.equal(catalogSurfaceVisible("search"), true);
    assert.equal(catalogSurfaceVisible("idle"), true);
  });

  it("search query present and no draft → search (catalog visible)", () => {
    assert.equal(resolve({ searchQuery: "Volvo V70" }), "search");
  });

  it("fresh homepage (no draft, no search) → idle (catalog visible)", () => {
    assert.equal(resolve({}), "idle");
  });
});

describe("surface ownership — state transitions", () => {
  it("SEARCH → SELL → SEARCH returns catalog surface ownership", () => {
    const search = resolve({ searchQuery: "Volvo V70" });
    assert.equal(search, "search");
    const sell = resolve({ searchQuery: "Volvo V70", hasListingDraft: true });
    assert.equal(sell, "sell_create");
    // returning to search (draft cleared) restores catalog visibility.
    const backToSearch = resolve({ searchQuery: "Volvo V70" });
    assert.equal(backToSearch, "search");
  });

  it("SELL → SELL continuation stays sell_create", () => {
    assert.equal(resolve({ hasListingDraft: true }), "sell_create");
    assert.equal(
      resolve({ hasListingDraft: true, searchQuery: "Volvo V70" }),
      "sell_create"
    );
  });

  it("fresh homepage → SELL", () => {
    assert.equal(resolve({}), "idle");
    assert.equal(resolve({ hasListingDraft: true }), "sell_create");
  });
});
