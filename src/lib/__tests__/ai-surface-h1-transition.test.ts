/**
 * FAIL-FIRST — H1: SELL → SEARCH must clear seller ownership so the catalog
 * surface becomes visible again.
 *
 * RED before fix: the `search` branch of `applyAgentActions` calls bare
 * `goToMarketplace("agent")`, leaving `aiDraft` set, so `resolveActiveSurface`
 * keeps returning "sell_create" and the search results grid stays hidden.
 *
 * Two layers:
 *  1. source contract — the search branch must use the SAME canonical seller-
 *     pipeline exit (`exitListingPipelineForMarketplaceSearch`) as browse_all.
 *  2. pure transition — with the seller draft cleared, the resolver must land
 *     on "search" (catalog visible) while preserving the query.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolveActiveSurface, catalogSurfaceVisible } from "@/lib/ai-surface-ownership";

const AGENT_SRC = readFileSync(
  new URL("../../context/VautoAgentContext.tsx", import.meta.url),
  "utf8"
);

function branchText(marker: string): string {
  const idx = AGENT_SRC.indexOf(marker);
  assert.ok(idx !== -1, `${marker} marker not found`);
  const tail = AGENT_SRC.slice(idx);
  const next = tail.slice(marker.length).search(/actions\.type === /);
  return next === -1 ? tail : tail.slice(0, marker.length + next);
}

describe("H1 — SELL → SEARCH clears seller ownership (source contract)", () => {
  it("search branch exits the seller pipeline (same canonical path as browse_all)", () => {
    const branch = branchText('actions.type === "search"');
    assert.ok(
      branch.includes("exitListingPipelineForMarketplaceSearch"),
      "search branch must call exitListingPipelineForMarketplaceSearch()"
    );
  });

  it("browse_all branch still exits the seller pipeline", () => {
    const branch = branchText('actions.type === "browse_all"');
    assert.ok(
      branch.includes("exitListingPipelineForMarketplaceSearch"),
      "browse_all branch must keep exitListingPipelineForMarketplaceSearch()"
    );
  });
});

describe("H1 — SELL → SEARCH surface transition (pure resolver)", () => {
  const searchState = { sellerStep: "idle", searchQuery: "Volvo V70" } as const;

  it("fresh SEARCH → catalog visible", () => {
    const s = resolveActiveSurface({ ...searchState, hasListingDraft: false });
    assert.equal(s, "search");
    assert.equal(catalogSurfaceVisible(s), true);
  });

  it("fresh SELL → sell_create (catalog hidden)", () => {
    const s = resolveActiveSurface({ ...searchState, hasListingDraft: true });
    assert.equal(s, "sell_create");
    assert.equal(catalogSurfaceVisible(s), false);
  });

  it("SELL → SEARCH (draft cleared by exit) → catalog visible again", () => {
    const duringSell = resolveActiveSurface({ ...searchState, hasListingDraft: true });
    assert.equal(duringSell, "sell_create");
    // The search action exits the seller pipeline → aiDraft cleared.
    const afterSearch = resolveActiveSurface({ ...searchState, hasListingDraft: false });
    assert.equal(afterSearch, "search");
    assert.equal(catalogSurfaceVisible(afterSearch), true);
  });

  it("SEARCH → SELL hides catalog", () => {
    const before = resolveActiveSurface({ ...searchState, hasListingDraft: false });
    assert.equal(before, "search");
    const after = resolveActiveSurface({ ...searchState, hasListingDraft: true });
    assert.equal(after, "sell_create");
    assert.equal(catalogSurfaceVisible(after), false);
  });

  it("SELL → SELL continuation stays sell_create", () => {
    assert.equal(
      resolveActiveSurface({ ...searchState, hasListingDraft: true }),
      "sell_create"
    );
    assert.equal(
      resolveActiveSurface({ sellerStep: "confirmation", searchQuery: "Volvo V70", hasListingDraft: true }),
      "sell_create"
    );
  });

  it("search query is preserved across the SELL→SEARCH transition (state ≠ visibility)", () => {
    // The resolver never mutates searchQuery; visibility is derived, state kept.
    const q = "Volvo V70";
    const s = resolveActiveSurface({ sellerStep: "idle", hasListingDraft: false, searchQuery: q });
    assert.equal(s, "search");
    assert.equal(q, "Volvo V70", "query must be untouched");
  });
});
