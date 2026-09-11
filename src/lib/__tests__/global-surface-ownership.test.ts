/**
 * R2.2 — global SELL surface ownership: every catalog/search renderer must
 * consume the SAME resolveActiveSurface/catalogSurfaceVisible authority.
 *
 * The previous live failure showed /search rendered the catalog ungated.
 * This is a source-contract guard that /search (like / and /discover) actually
 * consumes the canonical render decision, so the tested pure function is the
 * one the production component uses.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const SEARCH_SRC = readFileSync(
  new URL("../../app/search/page.tsx", import.meta.url),
  "utf8"
);

describe("R2.2 — /search consumes the canonical SELL surface authority", () => {
  it("/search imports and uses resolveActiveSurface + catalogSurfaceVisible", () => {
    assert.match(SEARCH_SRC, /resolveActiveSurface/, "/search must import resolveActiveSurface");
    assert.match(SEARCH_SRC, /catalogSurfaceVisible/, "/search must import catalogSurfaceVisible");
  });

  it("/search gates ListingGrid behind the surface decision", () => {
    // The ListingGrid render must be inside a showCatalog branch, not unconditional.
    assert.match(SEARCH_SRC, /showCatalog/, "/search must compute showCatalog");
    assert.match(SEARCH_SRC, /showCatalog &&/, "/search must gate on showCatalog");
  });
});
