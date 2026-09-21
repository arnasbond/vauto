/**
 * VAUTO AI Core v2.3P — semantic-claim responsibility prototype (deterministic).
 *
 * Proves the deterministic structure-only mapper + minimum-trust authority
 * flow. No network, no credential.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimsToPatches,
  parseSemanticDecision,
  semanticDecisionToReasoningDecision,
  type SemanticClaim,
  type SemanticDecision,
} from "../provider/semantic-claim.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleHardConstraints,
  executionEligibleSearchSubject,
} from "../state/marketplace-state.js";
import { setHardConstraint, applyStatePatches } from "../state/state-transitions.js";
import { runMultiStepLoop, deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import type { ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

function src(p: unknown): string {
  return (p as { provenance?: { source?: string } }).provenance?.source ?? "";
}

function readCapability(name: string): CapabilityContract<unknown, unknown> {
  return { name, description: name, consequence: "READ", validate: () => ({}), execute: async () => ({ ok: true, data: { count: 0, listings: [] } }) };
}
function registry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(readCapability("searchListings"));
  return r;
}
function input(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return { userTurn: "labas", history: [], state: emptyMarketplaceState(), capabilities: [{ name: "searchListings", description: "x", consequence: "READ" }], ...over };
}
function r3Provider(d: SemanticDecision): ReasoningProvider {
  return async () => semanticDecisionToReasoningDecision(d);
}

describe("Core v2.3P — semantic-claim mapper (structure-only)", () => {
  it("A: max-price claim maps to setHard priceMax", () => {
    const p = claimsToPatches([{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }]);
    assert.equal(p.length, 1);
    assert.equal((p[0] as { op: string }).op, "setHard");
    assert.equal((p[0] as { key?: string }).key, "priceMax");
    assert.equal((p[0] as { value?: unknown }).value, 15000);
    assert.equal(src(p[0]), "USER_STATED");
  });

  it("B: search-location claim maps to setHard location", () => {
    const p = claimsToPatches([{ role: "constraint", concept: "location", value: "Kaunas", strength: "hard" }]);
    assert.equal((p[0] as { key?: string }).key, "location");
    assert.equal((p[0] as { value?: unknown }).value, "Kaunas");
  });

  it("C: subject claim maps to setSearchSubject", () => {
    const p = claimsToPatches([{ role: "subject", value: "Toyota Corolla" }]);
    assert.equal((p[0] as { op: string }).op, "setSearchSubject");
    assert.equal((p[0] as { subject?: string }).subject, "Toyota Corolla");
  });

  it("D: soft constraint maps to addSoft (never setHard)", () => {
    const p = claimsToPatches([{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "soft" }]);
    assert.equal((p[0] as { op: string }).op, "addSoft");
    assert.equal(src(p[0]), "MODEL_INFERRED");
  });

  it("E: exclusion maps to addExclusion (never hard)", () => {
    const p = claimsToPatches([{ role: "exclusion", label: "diesel" }]);
    assert.equal((p[0] as { op: string }).op, "addExclusion");
    assert.equal((p[0] as { label?: string }).label, "diesel");
  });

  it("F: ambiguous constraint is non-executable (no patch)", () => {
    const p = claimsToPatches([{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "ambiguous" }]);
    assert.equal(p.length, 0);
  });

  it("G: unsupported/unknown role is skipped", () => {
    const p = claimsToPatches([{ role: "unknown" as SemanticClaim["role"] }]);
    assert.equal(p.length, 0);
  });

  it("J: retraction maps to removeHard", () => {
    const p = claimsToPatches([{ role: "retraction", target: "constraint", concept: "price", boundary: "max" }]);
    assert.equal((p[0] as { op: string }).op, "removeHard");
    assert.equal((p[0] as { key?: string }).key, "priceMax");
  });

  it("M: mapper assigns provenance (claim carries none); executable=USER_STATED, soft=MODEL_INFERRED", () => {
    const hard = claimsToPatches([{ role: "subject", value: "x" }]);
    assert.equal(src(hard[0]), "USER_STATED");
    const soft = claimsToPatches([{ role: "preference", label: "y" }]);
    assert.equal(src(soft[0]), "MODEL_INFERRED");
  });

  it("N: malformed claim (missing value) fails closed (no patch, no crash)", () => {
    const p = claimsToPatches([{ role: "constraint", concept: "price", boundary: "max", strength: "hard" }]);
    assert.equal(p.length, 0);
  });

  it("K: mapper is a pure function of claims only (deterministic)", () => {
    const c: SemanticClaim[] = [{ role: "exclusion", label: "diesel" }];
    assert.deepEqual(claimsToPatches(c), claimsToPatches(c));
  });
});

describe("Core v2.3P — authority flow via existing loop", () => {
  it("H: verifier rejection demotes USER_STATED candidate to MODEL_INFERRED (non-executable)", async () => {
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: r3Provider({ claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }], text: "ok" }),
      registry: reg,
      input: input(),
    });
    assert.equal(res.finalState.hardConstraints.priceMax, 15000);
    assert.equal(executionEligibleHardConstraints(res.finalState).priceMax, undefined, "default continuityVerifier is fail-closed");
  });

  it("H2: with a verifying verifier, the claim becomes execution-eligible", async () => {
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: r3Provider({ claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }] }),
      registry: reg,
      input: input(),
      authorityVerifier: verifyAll,
    });
    assert.equal(executionEligibleHardConstraints(res.finalState).priceMax, 15000);
  });

  it("I: changed claim replaces prior value (never accumulates)", async () => {
    const reg = registry();
    const prior = setHardConstraint(emptyMarketplaceState(), "priceMax", 20000, provenance("USER_STATED"));
    const res = await runMultiStepLoop({
      provider: r3Provider({ claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }] }),
      registry: reg,
      input: input({ state: prior }),
      authorityVerifier: verifyAll,
    });
    assert.equal(res.finalState.hardConstraints.priceMax, 15000);
  });

  it("L: capability args cannot override authoritative state", async () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 15000, provenance("USER_STATED"));
    const args = deriveSearchListingsArgs(s, { query: "invented", maxPrice: 999999 });
    assert.equal(args.query, undefined);
    assert.equal(args.maxPrice, 15000);
  });

  it("subject claim is execution-eligible only after verification", async () => {
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: r3Provider({ claims: [{ role: "subject", value: "Toyota Corolla" }] }),
      registry: reg,
      input: input(),
      authorityVerifier: verifyAll,
    });
    assert.equal(executionEligibleSearchSubject(res.finalState), "Toyota Corolla");
  });
});
