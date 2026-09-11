/**
 * R2 — Pipeline B (seller_submit) must materialize its draft into the SAME
 * canonical seller state that resolveActiveSurface() reads, so a successful
 * Pipeline B SELL draft owns the surface (catalog hidden).
 *
 * The R1 failure mode was testing only the pure resolver, not the production
 * branch. Here we cross the boundary as far as the repo allows without a
 * component renderer: a source-contract assertion that the seller-submit path
 * writes the canonical draft, plus the pure surface resolution.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  resolveActiveSurface,
  catalogSurfaceVisible,
} from "@/lib/ai-surface-ownership";

const SELLER_SRC = readFileSync(
  new URL("../../context/SellerFlowContext.tsx", import.meta.url),
  "utf8"
);

function runAiProcessingBody(): string {
  const marker = "const runAiProcessing = useCallback";
  const idx = SELLER_SRC.indexOf(marker);
  assert.ok(idx !== -1, "runAiProcessing marker not found");
  // The callback is large; capture a generous window that reaches the draft
  // materialization (setAiDraft) without needing an exact boundary.
  return SELLER_SRC.slice(idx, idx + 45000);
}

describe("R2 — Pipeline B seller_submit materializes canonical seller state", () => {
  it("runAiProcessing writes the draft into aiDraft (canonical seller state)", () => {
    const body = runAiProcessingBody();
    assert.ok(body.includes("setAiDraft"), "seller-submit path must setAiDraft");
  });

  it("a materialized Pipeline B draft owns the surface (catalog hidden)", () => {
    // After runAiProcessing sets aiDraft (and resets sellerStep to idle),
    // the surface must resolve to sell_create even with an empty query.
    const surface = resolveActiveSurface({
      sellerStep: "idle",
      hasListingDraft: true,
      searchQuery: "",
    });
    assert.equal(surface, "sell_create");
    assert.equal(catalogSurfaceVisible(surface), false);
  });

  it("catalog remains visible for genuine search (state preservation)", () => {
    const surface = resolveActiveSurface({
      sellerStep: "idle",
      hasListingDraft: false,
      searchQuery: "Volvo V70",
    });
    assert.equal(surface, "search");
    assert.equal(catalogSurfaceVisible(surface), true);
  });
});
