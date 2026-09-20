/**
 * VAUTO AI Core v2 — state transition semantics (A–H), no language logic.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyMarketplaceState,
  provenance,
} from "../state/marketplace-state.js";
import {
  addSoftPreference,
  addUnresolved,
  clearPendingAction,
  removeHardConstraint,
  removeSoftPreference,
  resolveUnresolved,
  setGoal,
  setHardConstraint,
  setPendingAction,
  setSelectedListings,
  setVertical,
} from "../state/state-transitions.js";

describe("Core v2 — structured state transitions", () => {
  it("A/B: new constraint adds; changed constraint REPLACES (never accumulates)", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    assert.equal(s.hardConstraints.priceMax, 20000);
    s = setHardConstraint(s, "priceMax", 15000, provenance("USER_STATED"));
    assert.equal(s.hardConstraints.priceMax, 15000, "changed value replaces old");
    assert.equal(Object.keys(s.hardConstraints).filter((k) => k === "priceMax").length, 1);
  });

  it("C: removed constraint is actually removed", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "location", "Kaunas", provenance("USER_STATED"));
    s = removeHardConstraint(s, "location");
    assert.equal(s.hardConstraints.location, undefined);
    assert.equal(s.hardConstraintProvenance.location, undefined);
  });

  it("D: unspecified constraint is preserved", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "location", "Kaunas", provenance("USER_STATED"));
    s = setHardConstraint(s, "priceMax", 150000, provenance("USER_STATED"));
    s = setGoal(s, "pasirinkti būsto tipą");
    assert.equal(s.hardConstraints.location, "Kaunas", "untouched constraint persists");
    assert.equal(s.hardConstraints.priceMax, 150000);
    assert.equal(s.goal, "pasirinkti būsto tipą");
  });

  it("E/F/G: provenance is attached and soft preferences never become hard filters", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 150000, provenance("USER_STATED"));
    s = addSoftPreference(s, "geras susisiekimas", provenance("MODEL_INFERRED", 0.6));

    assert.equal(s.hardConstraintProvenance.priceMax?.source, "USER_STATED");
    assert.equal(s.softPreferences[0]?.provenance.source, "MODEL_INFERRED");
    assert.equal(s.hardConstraints.priceMax, 150000);
    // Soft preference did NOT become a hard constraint.
    assert.equal(Object.keys(s.hardConstraints).includes("geras susisiekimas"), false);
  });

  it("soft preference re-stated updates provenance without duplicating", () => {
    let s = emptyMarketplaceState();
    s = addSoftPreference(s, "saugus", provenance("MODEL_INFERRED", 0.5));
    s = addSoftPreference(s, "saugus", provenance("USER_STATED"));
    assert.equal(s.softPreferences.length, 1, "no duplicate");
    assert.equal(s.softPreferences[0]?.provenance.source, "USER_STATED");
  });

  it("removeSoftPreference removes it", () => {
    let s = emptyMarketplaceState();
    s = addSoftPreference(s, "saugus", provenance("USER_STATED"));
    s = removeSoftPreference(s, "saugus");
    assert.equal(s.softPreferences.length, 0);
  });

  it("H: pending action is explicit and cleared only explicitly", () => {
    let s = emptyMarketplaceState();
    s = setPendingAction(s, { type: "publish_listing", description: "publikuoti skelbimą" });
    assert.equal(s.pendingAction?.type, "publish_listing");
    s = clearPendingAction(s);
    assert.equal(s.pendingAction, undefined);
  });

  it("unresolved questions add/resolve without duplication", () => {
    let s = emptyMarketplaceState();
    s = addUnresolved(s, "butas ar namas?");
    s = addUnresolved(s, "butas ar namas?");
    assert.equal(s.unresolved.length, 1);
    s = resolveUnresolved(s, "butas ar namas?");
    assert.equal(s.unresolved.length, 0);
  });

  it("selected listings and vertical set deterministically", () => {
    let s = emptyMarketplaceState();
    s = setVertical(s, "real_estate");
    s = setSelectedListings(s, ["l1", "l2"]);
    assert.equal(s.vertical, "real_estate");
    assert.deepEqual(s.selectedListingIds, ["l1", "l2"]);
  });
});
