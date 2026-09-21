/**
 * VAUTO AI Core v2.3A — typed state-patch contract + negation semantics.
 *
 * Mechanical tests for the architectural contract (NOT a Lithuanian phrase
 * whitelist). These lock in the canonical hard-constraint enum, the
 * scalar-only value rule, positive-inclusion vs negative-exclusion polarity,
 * continuity/replace/remove/preserve semantics, and fail-closed authority.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseReasoningDecision,
  StatePatchContractError,
  REASONING_DECISION_SCHEMA,
} from "../provider/schema.js";
import {
  CANONICAL_HARD_CONSTRAINT_KEYS,
  emptyMarketplaceState,
  provenance,
} from "../state/marketplace-state.js";
import {
  addExclusion,
  applyStatePatches,
  setHardConstraint,
  setSearchSubject,
} from "../state/state-transitions.js";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import { groundStatePatches } from "../loop/grounding.js";
import {
  continuityVerifier,
  createGeminiAuthorityVerifier,
  type AuthorityVerifier,
} from "../loop/authority-verifier.js";
import type { StatePatch } from "../state/state-patch.js";

describe("Core v2.3A — canonical state-patch contract", () => {
  it("response schema enumerates only the canonical keys", () => {
    const keySchema = REASONING_DECISION_SCHEMA.properties.statePatches.items.properties.key;
    assert.deepEqual(keySchema.enum, [...CANONICAL_HARD_CONSTRAINT_KEYS]);
  });

  it("1: canonical priceMax accepted and execution-eligible", () => {
    const d = parseReasoningDecision({
      statePatches: [{ op: "setHard", key: "priceMax", value: 20000, provenance: { source: "USER_STATED" } }],
    });
    const s = applyStatePatches(emptyMarketplaceState(), d.statePatches ?? []);
    assert.equal(s.hardConstraints.priceMax, 20000);
    assert.equal(deriveSearchListingsArgs(s, {}).maxPrice, 20000);
  });

  it("2: canonical location accepted and maps to city", () => {
    const d = parseReasoningDecision({
      statePatches: [{ op: "setHard", key: "location", value: "Kaunas", provenance: { source: "USER_STATED" } }],
    });
    const s = applyStatePatches(emptyMarketplaceState(), d.statePatches ?? []);
    assert.equal(s.hardConstraints.location, "Kaunas");
    assert.equal(deriveSearchListingsArgs(s, {}).city, "Kaunas");
  });

  it("3: empty key is rejected (never stored)", () => {
    assert.throws(
      () =>
        parseReasoningDecision({
          statePatches: [{ op: "setHard", key: "", value: 20000, provenance: { source: "USER_STATED" } }],
        }),
      StatePatchContractError
    );
  });

  it("4: unsupported 'city' key is rejected, not stored", () => {
    assert.throws(
      () =>
        parseReasoningDecision({
          statePatches: [{ op: "setHard", key: "city", value: "Vilnius", provenance: { source: "USER_STATED" } }],
        }),
      /noncanonical/
    );
  });

  it("5: array value is rejected (no as-cast coercion)", () => {
    assert.throws(
      () =>
        parseReasoningDecision({
          statePatches: [{ op: "setHard", key: "category", value: ["SUV"], provenance: { source: "USER_STATED" } }],
        }),
      /scalar/
    );
  });
});

describe("Core v2.3A — search subject + inclusion/exclusion polarity", () => {
  it("6: explicit search subject is execution-eligible", () => {
    let s = emptyMarketplaceState();
    s = setSearchSubject(s, "Toyota Corolla", provenance("USER_STATED"));
    assert.equal(deriveSearchListingsArgs(s, {}).query, "Toyota Corolla");
  });

  it("7: invented (MODEL_INFERRED) subject is not executable", () => {
    let s = emptyMarketplaceState();
    s = setSearchSubject(s, "Toyota", provenance("MODEL_INFERRED", 0.8));
    assert.equal(deriveSearchListingsArgs(s, {}).query, undefined);
  });

  it("8: positive inclusion (setHard USER_STATED) is executable", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 15000, provenance("USER_STATED"));
    assert.equal(deriveSearchListingsArgs(s, {}).maxPrice, 15000);
  });

  it("9: explicit exclusion is a non-executable exclusion, never a hard filter", () => {
    let s = emptyMarketplaceState();
    s = addExclusion(s, "diesel", provenance("USER_STATED"));
    assert.equal(s.exclusions.length, 1);
    assert.equal(s.exclusions[0]?.label, "diesel");
    assert.equal(Object.keys(s.hardConstraints).length, 0, "exclusion must not enter hardConstraints");
    const args = deriveSearchListingsArgs(s, {});
    assert.equal(args.maxPrice, undefined);
    assert.equal(args.city, undefined);
    assert.equal(args.category, undefined);
  });

  it("10: negated positive claim is CONTRADICTED, not a positive filter", async () => {
    const patch: StatePatch = {
      op: "setHard",
      key: "category",
      value: "vehicles",
      provenance: provenance("USER_STATED"),
      evidence: "SUV",
    };
    const verifier: AuthorityVerifier = async () => "CONTRADICTED";
    const { accepted, rejectedAuthority } = await groundStatePatches(
      emptyMarketplaceState(),
      [patch],
      "SUV nenoriu",
      verifier
    );
    assert.equal(rejectedAuthority.length, 1);
    const s = applyStatePatches(emptyMarketplaceState(), accepted);
    assert.notEqual(s.hardConstraintProvenance.category?.source, "USER_STATED");
    assert.equal(deriveSearchListingsArgs(s, {}).category, undefined);
  });
});

describe("Core v2.3A — continuity / replace / remove / preserve", () => {
  it("11: continuity preserves prior verified state", async () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    const patch: StatePatch = { op: "setHard", key: "priceMax", value: 20000, provenance: provenance("USER_STATED") };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "o dabar parodyk", continuityVerifier);
    assert.equal(rejectedAuthority.length, 0);
    const s2 = applyStatePatches(s, accepted);
    assert.equal(s2.hardConstraints.priceMax, 20000);
    assert.equal(s2.hardConstraintProvenance.priceMax?.source, "USER_STATED");
  });

  it("12: changed constraint replaces previous value (never accumulates)", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setHardConstraint(s, "priceMax", 15000, provenance("USER_STATED"));
    assert.equal(s.hardConstraints.priceMax, 15000);
  });

  it("13: explicit removal removes it", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "location", "Kaunas", provenance("USER_STATED"));
    const d = parseReasoningDecision({ statePatches: [{ op: "removeHard", key: "location" }] });
    const s2 = applyStatePatches(s, d.statePatches ?? []);
    assert.equal(s2.hardConstraints.location, undefined);
  });

  it("14: unspecified constraint remains", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "location", "Kaunas", provenance("USER_STATED"));
    s = setHardConstraint(s, "priceMax", 160000, provenance("USER_STATED"));
    assert.equal(s.hardConstraints.location, "Kaunas");
    assert.equal(s.hardConstraints.priceMax, 160000);
  });
});

describe("Core v2.3A — authority fails closed", () => {
  it("15: verifier provider failure cannot grant execution authority", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const verifier = createGeminiAuthorityVerifier({ fetchImpl });
    const verdict = await verifier(
      { op: "setHard", key: "priceMax", value: 20000, evidence: "iki 20 tūkst." },
      { userTurn: "iki 20 tūkst.", priorState: emptyMarketplaceState() }
    );
    assert.equal(verdict, "UNSUPPORTED");
  });

  it("15b: verifier non-2xx response fails closed", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 500, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const verifier = createGeminiAuthorityVerifier({ fetchImpl });
    const verdict = await verifier(
      { op: "setHard", key: "location", value: "Kaunas", evidence: "Kaune" },
      { userTurn: "Kaune", priorState: emptyMarketplaceState() }
    );
    assert.equal(verdict, "UNSUPPORTED");
  });
});
