import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";
import { groundStatePatches } from "../loop/grounding.js";
import { continuityVerifier } from "../loop/authority-verifier.js";
import type { StatePatch } from "../state/state-patch.js";
import { searchListingsCapability } from "../capability/capabilities/search-listings.js";
import { createGuardedListingDetails, createBuyerRegistry } from "../journey/conversation.js";
import { publishListingCapability } from "../capability/capabilities/publish-listing.js";

describe("Core v2 Direct Path Simplification", () => {
  it("1. model searchListings args reach capability validation/execution rather than being discarded", () => {
    const state = emptyMarketplaceState();
    const modelArgs = {
      category: "Transportas",
      maxPrice: 20000,
      query: "BMW",
    };
    const derived = deriveSearchListingsArgs(state, modelArgs);
    assert.equal(derived.category, "Transportas");
    assert.equal(derived.maxPrice, 20000);
    assert.equal(derived.query, "BMW");
  });

  it("2. omitted authoritative constraints may be inherited from state", () => {
    let state = emptyMarketplaceState();
    state = setHardConstraint(state, "location", "Kaunas", provenance("USER_STATED"));
    state = setHardConstraint(state, "priceMax", 15000, provenance("USER_STATED"));

    const modelArgs = {
      category: "Transportas",
      // location and priceMax omitted in modelArgs
    };
    const derived = deriveSearchListingsArgs(state, modelArgs);
    assert.equal(derived.category, "Transportas");
    assert.equal(derived.city, "Kaunas", "inherited location from state");
    assert.equal(derived.maxPrice, 15000, "inherited priceMax from state");
  });

  it("3. model inference cannot self-promote into authoritative USER_STATED state", async () => {
    const state = emptyMarketplaceState();
    const patch: StatePatch = {
      op: "setHard",
      key: "priceMax",
      value: 20000,
      provenance: provenance("USER_STATED"), // model attempting to self-grant USER_STATED
    };
    const { accepted, rejectedAuthority } = await groundStatePatches(
      state,
      [patch],
      "parodyk man ką nors",
      continuityVerifier
    );
    assert.equal(rejectedAuthority.length, 1);
    assert.equal(
      (accepted[0] as { provenance?: { source?: string } })?.provenance?.source,
      "MODEL_INFERRED",
      "demoted to MODEL_INFERRED"
    );
  });

  it("4. prior authoritative constraints survive ordinary conversational continuation", async () => {
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
      continuityVerifier
    );
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(
      (accepted[0] as { provenance?: { source?: string } })?.provenance?.source,
      "USER_STATED",
      "prior state preserved as USER_STATED"
    );
  });

  it("5. PR #93 category/maxPrice grounding remains enforced during searchListings execution", async () => {
    const res = await searchListingsCapability.execute(
      { category: "Transportas", maxPrice: 20000 },
      {}
    );
    assert.equal(res.ok, true);
    if (res.ok && res.data) {
      for (const listing of res.data.listings) {
        assert.ok(listing.price <= 20000);
      }
    }
  });

  it("6. listingDetails reference guard remains enforced", async () => {
    const emptyContext = { listings: [] };
    const guarded = createGuardedListingDetails(emptyContext);
    const res = await guarded.execute({ idOrSlug: "invented-id" }, {});
    assert.equal(res.ok, false);
    assert.equal(res.error, "listing not in grounded result set");
  });

  it("7. publishListing still requires existing auth/HITL boundary", async () => {
    const unauthedRes = await publishListingCapability.execute(
      { title: "Test", category: "vehicles" },
      {}
    );
    assert.equal(unauthedRes.ok, false);
    assert.equal(unauthedRes.failureKind, "authorization");

    const unconfirmedRes = await publishListingCapability.execute(
      { title: "Test", category: "vehicles" },
      { authUserId: "user-1" }
    );
    assert.equal(unconfirmedRes.ok, false);
    assert.equal(unconfirmedRes.failureKind, "confirmation_required");
  });
});
