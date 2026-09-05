import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveListingDraftForWire,
  type WireListingDraft,
} from "@/lib/agent-wire-context";
import { isGenericListingDraftTitle } from "@vauto/shared/listing-organism";

const genericSeed: WireListingDraft = {
  title: "Naujas skelbimas",
  category: "other",
  price: 0,
  location: "Vilnius",
  listingFlowState: "DRAFT_READY",
  attributes: {},
};

describe("P0 — generic listing title boundary", () => {
  it("flags the generic seed titles and their category-prefixed variants", () => {
    assert.equal(isGenericListingDraftTitle("Naujas skelbimas"), true);
    assert.equal(isGenericListingDraftTitle("Drabužių skelbimas"), true);
    assert.equal(isGenericListingDraftTitle("prekė"), true);
    assert.equal(isGenericListingDraftTitle("Transportas — naujas skelbimas"), true);
    assert.equal(isGenericListingDraftTitle("Mada - naujas skelbimas"), true);
    assert.equal(isGenericListingDraftTitle(""), true);
    assert.equal(isGenericListingDraftTitle(undefined), true);
    assert.equal(isGenericListingDraftTitle(null), true);
    assert.equal(isGenericListingDraftTitle("   "), true);
  });

  it("keeps concrete titles", () => {
    assert.equal(isGenericListingDraftTitle("iPhone 15 Pro 256 GB"), false);
    assert.equal(isGenericListingDraftTitle("BMW 320d 2015"), false);
    assert.equal(isGenericListingDraftTitle("3 kambarių butas Vilniuje"), false);
  });

  it("keeps LEGITIMATE titles that merely contain the placeholder phrase", () => {
    assert.equal(isGenericListingDraftTitle("Naujas skelbimas automobiliams"), false);
    assert.equal(isGenericListingDraftTitle("Mano naujas skelbimas"), false);
    assert.equal(isGenericListingDraftTitle("Naujas skelbimas: iPhone 15 Pro"), false);
    assert.equal(isGenericListingDraftTitle("Naujas skelbimas jau paruoštas"), false);
  });
});

describe("P0 — wire draft boundary (resolveListingDraftForWire)", () => {
  it("never ships the generic seed, even with a locked price from the current turn", () => {
    assert.equal(
      resolveListingDraftForWire({ baseDraft: genericSeed, lockedPrice: 850 }),
      undefined
    );
    assert.equal(
      resolveListingDraftForWire({ baseDraft: genericSeed, lockedPrice: null }),
      undefined
    );
  });

  it("never fabricates a draft from a locked price when there is no base draft", () => {
    assert.equal(
      resolveListingDraftForWire({ baseDraft: null, lockedPrice: 850 }),
      undefined
    );
    assert.equal(
      resolveListingDraftForWire({ baseDraft: undefined, lockedPrice: 850 }),
      undefined
    );
  });

  it("never ships an empty-title base draft", () => {
    assert.equal(
      resolveListingDraftForWire({
        baseDraft: { ...genericSeed, title: "" },
        lockedPrice: 850,
      }),
      undefined
    );
  });

  it("ships a concrete draft with the locked price overlaid (real update flow)", () => {
    const concrete: WireListingDraft = {
      title: "iPhone 15 Pro",
      category: "electronics",
      price: 700,
      location: "Kaunas",
      listingFlowState: "DRAFT_READY",
      attributes: { condition: "Naudota" },
    };
    const shipped = resolveListingDraftForWire({
      baseDraft: concrete,
      lockedPrice: 850,
    });
    assert.deepEqual(shipped, { ...concrete, price: 850 });
  });

  it("ships a concrete draft unchanged without a locked price", () => {
    const concrete: WireListingDraft = {
      title: "iPhone 15 Pro",
      category: "electronics",
      price: 850,
      location: "Kaunas",
      listingFlowState: "DRAFT_READY",
      attributes: { condition: "Naudota" },
    };
    assert.deepEqual(
      resolveListingDraftForWire({ baseDraft: concrete, lockedPrice: null }),
      concrete
    );
  });
});
