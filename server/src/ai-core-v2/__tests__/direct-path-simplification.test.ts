import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";
import { groundStatePatches } from "../loop/grounding.js";
import { deterministicAuthorityVerifier } from "../loop/authority-verifier.js";
import type { StatePatch } from "../state/state-patch.js";

describe("Core v2 Direct Path Simplification — Atlas Required Invariants", () => {
  it("1. new explicit current-turn claim with verbatim grounded evidence becomes execution eligible", async () => {
    const state = emptyMarketplaceState();
    const patch: StatePatch = {
      op: "setHard",
      key: "priceMax",
      value: 15000,
      evidence: "15000",
      provenance: provenance("USER_STATED"),
    };
    const { accepted, rejectedAuthority } = await groundStatePatches(
      state,
      [patch],
      "Ieškau auto iki 15000 eurų",
      deterministicAuthorityVerifier
    );
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(
      (accepted[0] as { provenance?: { source?: string } })?.provenance?.source,
      "USER_STATED"
    );
  });

  it("2. invented/nonexistent evidence cannot self-authorize", async () => {
    const state = emptyMarketplaceState();
    const patch: StatePatch = {
      op: "setHard",
      key: "priceMax",
      value: 15000,
      evidence: "15000",
      provenance: provenance("USER_STATED"),
    };
    const { accepted, rejectedAuthority } = await groundStatePatches(
      state,
      [patch],
      "Labas, ką rekomenduoji?",
      deterministicAuthorityVerifier
    );
    assert.equal(rejectedAuthority.length, 1);
    assert.equal(
      (accepted[0] as { provenance?: { source?: string } })?.provenance?.source,
      "MODEL_INFERRED"
    );
  });

  it("3. prior USER_STATED continuity remains authoritative", async () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "priceMax", 20000, provenance("USER_STATED"));
    const patch: StatePatch = {
      op: "setHard",
      key: "priceMax",
      value: 20000,
      provenance: provenance("USER_STATED"),
    };
    const { accepted, rejectedAuthority } = await groundStatePatches(
      state,
      [patch],
      "o dabar parodyk dar",
      deterministicAuthorityVerifier
    );
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(
      (accepted[0] as { provenance?: { source?: string } })?.provenance?.source,
      "USER_STATED"
    );
  });

  it("4. authoritative maxPrice cannot be widened by capability args", () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "priceMax", 15000, provenance("USER_STATED"));
    const derived = deriveSearchListingsArgs(state, { maxPrice: 999999 });
    assert.equal(derived.maxPrice, 15000);
  });

  it("5. model may narrow a numeric hard bound", () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "priceMax", 15000, provenance("USER_STATED"));
    const derived = deriveSearchListingsArgs(state, { maxPrice: 12000 });
    assert.equal(derived.maxPrice, 12000);
  });

  it("6. omitted args inherit authoritative state", () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "priceMax", 15000, provenance("USER_STATED"));
    state = setHardConstraint(state, "location", "Kaunas", provenance("USER_STATED"));

    const derived = deriveSearchListingsArgs(state, { category: "Transportas" });
    assert.equal(derived.maxPrice, 15000);
    assert.equal(derived.city, "Kaunas");
    assert.equal(derived.category, "Transportas");
  });

  it("7. conflicting category/location cannot override authoritative state absent an authorized state transition", () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "category", "Transportas", provenance("USER_STATED"));
    state = setHardConstraint(state, "location", "Kaunas", provenance("USER_STATED"));

    const derived = deriveSearchListingsArgs(state, { category: "Elektronika", city: "Vilnius" });
    assert.equal(derived.category, "Transportas");
    assert.equal(derived.city, "Kaunas");
  });
});
