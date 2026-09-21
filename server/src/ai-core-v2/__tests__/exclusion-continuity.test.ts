/**
 * VAUTO AI Core v2.3B — negative-preference (exclusion) continuity, multi-turn
 * state-machine semantics. Deterministic; proves the MACHINERY that the real
 * model drives: an exclusion established in turn 1 is preserved through later
 * unrelated turns, never becomes an opposite positive executable filter, and
 * remains available to reasoning.
 *
 * No phrase rules, no make/model lists, no Lithuanian special-cases.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { applyStatePatches, addExclusion, setHardConstraint } from "../state/state-transitions.js";
import { groundStatePatches } from "../loop/grounding.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import { continuityVerifier, type AuthorityVerifier } from "../loop/authority-verifier.js";
import type { StatePatch } from "../state/state-patch.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

describe("Core v2.3B — exclusion continuity (multi-turn)", () => {
  it("turn-1 exclusion is preserved through later turns and never becomes a positive filter", async () => {
    // Turn 1: user excludes a fuel type.
    const t1: StatePatch = {
      op: "addExclusion",
      label: "diesel",
      provenance: provenance("USER_STATED"),
      evidence: "tik ne dyzelinio",
    };
    const { accepted: a1 } = await groundStatePatches(emptyMarketplaceState(), [t1], "tik ne dyzelinio", verifyAll);
    let s = applyStatePatches(emptyMarketplaceState(), a1);
    assert.equal(s.exclusions.length, 1);
    assert.equal(s.exclusions[0]?.provenance.source, "USER_STATED");

    // Turn 2: user adds a budget WITHOUT repeating the exclusion.
    const t2: StatePatch = { op: "setHard", key: "priceMax", value: 15000, provenance: provenance("USER_STATED") };
    const { accepted: a2 } = await groundStatePatches(s, [t2], "iki 15 000 eurų", verifyAll);
    s = applyStatePatches(s, a2);

    // Turn 3: search/recommendation turn (no patches) — exclusion still present.
    assert.equal(s.exclusions.length, 1, "exclusion preserved through unrelated turns");
    assert.equal(s.exclusions[0]?.label, "diesel");
    assert.equal(s.exclusions[0]?.provenance.source, "USER_STATED");

    // Execution-safe args: budget applies, exclusion NEVER becomes a filter.
    const args = deriveSearchListingsArgs(s, {});
    assert.equal(args.maxPrice, 15000);
    assert.equal(args.category, undefined);
    assert.equal(args.city, undefined);
    assert.equal(args.query, undefined, "exclusion must not become a positive query");
    assert.equal(
      Object.keys(s.hardConstraints).some((k) => /d(i|y)?zel/i.test(String(s.hardConstraints[k as keyof typeof s.hardConstraints]))),
      false,
      "exclusion never stored as a positive hard constraint"
    );
  });

  it("continuity verifier re-verifies a re-stated exclusion as USER_STATED", async () => {
    let s = addExclusion(emptyMarketplaceState(), "SUV", provenance("USER_STATED"));
    const patch: StatePatch = { op: "addExclusion", label: "SUV", provenance: provenance("USER_STATED") };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "vis dar nenoriu SUV", continuityVerifier);
    assert.equal(rejectedAuthority.length, 0);
    const s2 = applyStatePatches(s, accepted);
    assert.equal(s2.exclusions[0]?.provenance.source, "USER_STATED");
  });

  it("an ungrounded (invented) exclusion is demoted to MODEL_INFERRED", async () => {
    const patch: StatePatch = { op: "addExclusion", label: "diesel", provenance: provenance("USER_STATED") };
    const { accepted, rejectedAuthority } = await groundStatePatches(
      emptyMarketplaceState(),
      [patch],
      "reikia šeimai automobilio",
      continuityVerifier
    );
    assert.equal(rejectedAuthority.length, 1);
    const s = applyStatePatches(emptyMarketplaceState(), accepted);
    assert.equal(s.exclusions[0]?.provenance.source, "MODEL_INFERRED");
    // Even demoted, it is non-executable.
    assert.equal(deriveSearchListingsArgs(s, {}).category, undefined);
  });
});
