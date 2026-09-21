/**
 * VAUTO AI Core v2.3Q — retraction/removal authority closure (deterministic).
 *
 * A mutation that removes or weakens AUTHORITATIVE (USER_STATED) state must
 * require the same verified authority as the mutation that created it. No
 * network, no credential.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groundStatePatches } from "../loop/grounding.js";
import {
  applyStatePatches,
  setHardConstraint,
  addExclusion,
  setSearchSubject,
} from "../state/state-transitions.js";
import { emptyMarketplaceState, provenance, type MarketplaceState } from "../state/marketplace-state.js";
import type { AuthorityVerifier, AuthorityVerdict } from "../loop/authority-verifier.js";

function fixedVerifier(verdict: AuthorityVerdict, calls?: { n: number }): AuthorityVerifier {
  return async () => {
    if (calls) calls.n++;
    return verdict;
  };
}

function withVerifiedPriceMax(): MarketplaceState {
  return setHardConstraint(emptyMarketplaceState(), "priceMax", 20000, provenance("USER_STATED"));
}

describe("Core v2.3Q — retraction authority", () => {
  it("A: unsupported removal of verified hard constraint is preserved", async () => {
    let s = withVerifiedPriceMax();
    const calls = { n: 0 };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [{ op: "removeHard", key: "priceMax" }], "parodyk", fixedVerifier("UNSUPPORTED", calls));
    assert.equal(calls.n, 1, "removal of authoritative state must be verified");
    assert.equal(rejectedAuthority.length, 1);
    assert.equal(applyStatePatches(s, accepted).hardConstraints.priceMax, 20000, "preserved");
  });

  it("B: ambiguous removal of verified hard constraint is preserved", async () => {
    let s = withVerifiedPriceMax();
    const { accepted } = await groundStatePatches(s, [{ op: "removeHard", key: "priceMax" }], "gal", fixedVerifier("AMBIGUOUS"));
    assert.equal(applyStatePatches(s, accepted).hardConstraints.priceMax, 20000, "preserved");
  });

  it("C: verified explicit removal removes it", async () => {
    let s = withVerifiedPriceMax();
    const { accepted } = await groundStatePatches(s, [{ op: "removeHard", key: "priceMax" }], "be biudžeto", fixedVerifier("VERIFIED_USER_INTENT"));
    assert.equal(applyStatePatches(s, accepted).hardConstraints.priceMax, undefined, "removed");
  });

  it("D: verified replacement replaces old value", async () => {
    let s = withVerifiedPriceMax();
    const { accepted } = await groundStatePatches(
      s,
      [{ op: "setHard", key: "priceMax", value: 25000, provenance: provenance("USER_STATED") }],
      "iki 25 tūkst.",
      fixedVerifier("VERIFIED_USER_INTENT")
    );
    assert.equal(applyStatePatches(s, accepted).hardConstraints.priceMax, 25000, "replaced");
  });

  it("E: unsupported removal of verified searchSubject is preserved", async () => {
    let s = setSearchSubject(emptyMarketplaceState(), "Toyota Corolla", provenance("USER_STATED"));
    const { accepted } = await groundStatePatches(s, [{ op: "removeSearchSubject" }], "parodyk", fixedVerifier("UNSUPPORTED"));
    assert.equal(applyStatePatches(s, accepted).searchSubject, "Toyota Corolla", "preserved");
  });

  it("F: verified removal of searchSubject removes it", async () => {
    let s = setSearchSubject(emptyMarketplaceState(), "Toyota Corolla", provenance("USER_STATED"));
    const { accepted } = await groundStatePatches(s, [{ op: "removeSearchSubject" }], "jokio Toyota", fixedVerifier("VERIFIED_USER_INTENT"));
    assert.equal(applyStatePatches(s, accepted).searchSubject, undefined, "removed");
  });

  it("G: unsupported removal of verified exclusion is preserved", async () => {
    let s = addExclusion(emptyMarketplaceState(), "diesel", provenance("USER_STATED"));
    const { accepted } = await groundStatePatches(s, [{ op: "removeExclusion", label: "diesel" }], "parodyk", fixedVerifier("UNSUPPORTED"));
    assert.equal(applyStatePatches(s, accepted).exclusions.length, 1, "preserved");
  });

  it("H: verified removal of exclusion removes it", async () => {
    let s = addExclusion(emptyMarketplaceState(), "diesel", provenance("USER_STATED"));
    const { accepted } = await groundStatePatches(s, [{ op: "removeExclusion", label: "diesel" }], "dyzelis tinka", fixedVerifier("VERIFIED_USER_INTENT"));
    assert.equal(applyStatePatches(s, accepted).exclusions.length, 0, "removed");
  });

  it("I: removal of MODEL_INFERRED state needs no authority (applied directly)", async () => {
    let s = setHardConstraint(emptyMarketplaceState(), "priceMax", 20000, provenance("MODEL_INFERRED"));
    const calls = { n: 0 };
    const { accepted } = await groundStatePatches(s, [{ op: "removeHard", key: "priceMax" }], "kitaip", fixedVerifier("UNSUPPORTED", calls));
    assert.equal(calls.n, 0, "no verifier call for non-authoritative removal");
    assert.equal(applyStatePatches(s, accepted).hardConstraints.priceMax, undefined, "removed (model inference is non-authoritative)");
  });

  it("J: removal of GROUNDED_FACT state is not treated as USER_INTENT removal", async () => {
    let s = setHardConstraint(emptyMarketplaceState(), "category", "vehicles", provenance("TOOL_DERIVED"));
    const calls = { n: 0 };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [{ op: "removeHard", key: "category" }], "kitaip", fixedVerifier("UNSUPPORTED", calls));
    assert.equal(calls.n, 0, "grounded fact removal is not authority-verified as user intent");
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(applyStatePatches(s, accepted).hardConstraints.category, undefined, "grounded fact removed directly");
  });

  it("K: unrelated user turn preserves all prior USER_STATED state", async () => {
    let s = withVerifiedPriceMax();
    s = setHardConstraint(s, "location", "Kaunas", provenance("USER_STATED"));
    const { accepted } = await groundStatePatches(s, [], "parodyk, ką turit", fixedVerifier("VERIFIED_USER_INTENT"));
    const s2 = applyStatePatches(s, accepted);
    assert.equal(s2.hardConstraints.priceMax, 20000);
    assert.equal(s2.hardConstraints.location, "Kaunas");
  });

  it("L: malicious/hallucinated retraction loses no authoritative state", async () => {
    let s = withVerifiedPriceMax();
    s = setSearchSubject(s, "Toyota Corolla", provenance("USER_STATED"));
    const { accepted, rejectedAuthority } = await groundStatePatches(
      s,
      [{ op: "removeHard", key: "priceMax" }, { op: "removeSearchSubject" }],
      "visai nesusijęs turnas",
      fixedVerifier("UNSUPPORTED")
    );
    assert.equal(rejectedAuthority.length, 2);
    const s2 = applyStatePatches(s, accepted);
    assert.equal(s2.hardConstraints.priceMax, 20000, "hard preserved");
    assert.equal(s2.searchSubject, "Toyota Corolla", "subject preserved");
  });
});
