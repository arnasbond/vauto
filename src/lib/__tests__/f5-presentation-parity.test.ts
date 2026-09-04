/**
 * F5 — vertical presentation contract parity (client side).
 *
 * The card/detail presentation adapter (`vertical-presentation-contract.ts`)
 * is a READ-ONLY adapter over the canonical marketplace registry. This test
 * certifies it never invents attributes, never leaks foreign vertical fields
 * onto cards, and falls back to the universal path for legacy categories
 * (clothing/fashion are NOT canonical 13A root verticals).
 *
 * No jsdom/React: pure presentation-logic modules.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  VERTICAL_PRESENTATION_CONTRACTS,
  canonicalAttributeValue,
  cardAttributeLinesForListing,
  enabledViewModesForVertical,
  presentationContractForListing,
  presentationContractForVertical,
  verticalIdForListingCategory,
} from "@/lib/vertical-presentation-contract";
import { VERTICAL_ATTRIBUTES } from "@vauto/shared/marketplace-domain";
import type { VerticalId } from "@vauto/shared/marketplace-domain";

const ALL_VERTICALS: VerticalId[] = [
  "TRANSPORT",
  "REAL_ESTATE",
  "ELECTRONICS",
  "SERVICES",
  "JOBS",
  "HOME_GARDEN",
];

describe("F5 — presentation contract parity (client)", () => {
  it("every canonical vertical has a contract; card attributes are canonical only", () => {
    for (const id of ALL_VERTICALS) {
      const contract = presentationContractForVertical(id);
      assert.ok(contract, `contract for ${id}`);
      const known = new Set(VERTICAL_ATTRIBUTES[id].map((a) => a.key));
      for (const card of contract.cardAttributes) {
        assert.ok(known.has(card.key), `card attribute ${card.key} is canonical for ${id}`);
      }
    }
  });

  it("detailPriority keys are canonical (price/location allowed as universal)", () => {
    for (const id of ALL_VERTICALS) {
      const contract = VERTICAL_PRESENTATION_CONTRACTS[id];
      const known = new Set(VERTICAL_ATTRIBUTES[id].map((a) => a.key));
      for (const key of contract.detailPriority) {
        assert.ok(
          key === "price" || key === "location" || known.has(key),
          `detailPriority "${key}" is canonical for ${id}`
        );
      }
    }
  });

  it("legacy clothing/fashion resolves to the canonical CLOTHING vertical", () => {
    assert.equal(verticalIdForListingCategory("clothing"), "CLOTHING");
    const contract = presentationContractForListing({ category: "clothing" });
    assert.ok(contract);
    assert.equal(contract!.verticalId, "CLOTHING");
  });

  it("canonical listing categories map to the right contract", () => {
    assert.equal(verticalIdForListingCategory("vehicles"), "TRANSPORT");
    assert.equal(verticalIdForListingCategory("transport"), "TRANSPORT");
    assert.equal(verticalIdForListingCategory("real_estate"), "REAL_ESTATE");
    assert.equal(verticalIdForListingCategory("electronics"), "ELECTRONICS");
    assert.equal(verticalIdForListingCategory("services"), "SERVICES");
    assert.equal(verticalIdForListingCategory("jobs"), "JOBS");
    assert.equal(verticalIdForListingCategory("home"), "HOME_GARDEN");
  });

  it("card lines read canonical keys and legacy aliases without inventing values", () => {
    const lines = cardAttributeLinesForListing(
      { category: "jobs", attributes: { position: "Vairuotojas", salaryMin: "1500" } },
      3
    );
    assert.ok(lines.some((l) => l.key === "jobTitle" && l.value === "Vairuotojas"), "legacy alias");
    assert.ok(lines.some((l) => l.key === "salaryMin"), "canonical salary");
    for (const line of lines) {
      assert.ok(line.key, "every line has a canonical key");
      assert.ok(line.value, "no empty invented values");
    }
  });

  it("canonicalAttributeValue never returns values for foreign keys", () => {
    assert.equal(
      canonicalAttributeValue({ attributes: { vin: "X" } }, "make"),
      null,
      "no foreign vertical attribute"
    );
    assert.equal(
      canonicalAttributeValue({ attributes: { make: "BMW" } }, "make"),
      "BMW"
    );
  });
});
