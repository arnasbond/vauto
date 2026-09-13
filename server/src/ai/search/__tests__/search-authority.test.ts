/**
 * R4.3B — search-state continuity authority (deterministic, no model).
 *
 * Proves the prior persisted search object is used as the LOWEST-priority
 * fallback so a refinement turn ("iki 12000") keeps the prior object while a
 * new explicit value replaces it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSearchCategory,
  resolveSearchCity,
  resolveSearchPrice,
} from "../search-authority.js";

describe("search-authority — prior persisted search fallback (R4.3B)", () => {
  it("price: prior bound fills the gap when neither user nor model provide it", () => {
    const r = resolveSearchPrice({
      modelMin: undefined,
      modelMax: undefined,
      userMin: undefined,
      userMax: undefined,
      priorMin: 5000,
      priorMax: 10000,
    });
    assert.equal(r.minPrice, 5000);
    assert.equal(r.maxPrice, 10000);
    assert.equal(r.conflict, false);
  });

  it("price: an explicit user bound REPLACES the prior bound", () => {
    const r = resolveSearchPrice({
      modelMin: undefined,
      modelMax: 12000,
      userMin: undefined,
      userMax: undefined,
      priorMin: 5000,
      priorMax: 10000,
    });
    assert.equal(r.maxPrice, 12000);
    assert.equal(r.minPrice, 5000, "unrelated prior min is retained");
  });

  it("city: prior city fills the gap; explicit user city wins", () => {
    assert.equal(resolveSearchCity(undefined, undefined, "Vilnius"), "Vilnius");
    assert.equal(resolveSearchCity(undefined, "Kaunas", "Vilnius"), "Kaunas");
    assert.equal(resolveSearchCity("Klaipėda", undefined, "Vilnius"), "Klaipėda");
  });

  it("category: prior category fills the gap; model/user category wins", () => {
    assert.equal(resolveSearchCategory(undefined, undefined, "vehicles"), "vehicles");
    assert.equal(resolveSearchCategory("electronics", undefined, "vehicles"), "electronics");
    assert.equal(resolveSearchCategory(undefined, "real_estate", "vehicles"), "real_estate");
  });

  it("category: the current user's category outranks a conflicting model value", () => {
    assert.equal(
      resolveSearchCategory("vehicles", "electronics", "real_estate"),
      "electronics"
    );
  });
});
