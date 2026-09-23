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
  return { name, description: name, operation: "READ", validate: () => ({}), execute: async () => ({ ok: true, data: { count: 0, listings: [] } }) };
}
function registry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(readCapability("searchListings"));
  return r;
}
function input(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return { userTurn: "labas", history: [], state: emptyMarketplaceState(), capabilities: [{ name: "searchListings", description: "x", operation: "READ" }], ...over };
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
    const stripAt = (patches: ReturnType<typeof claimsToPatches>) =>
      patches.map((p) => {
        if ("provenance" in p && p.provenance) {
          const { provenance, ...rest } = p;
          return { ...rest, provenance: { source: provenance.source } };
        }
        return p;
      });
    assert.deepEqual(stripAt(claimsToPatches(c)), stripAt(claimsToPatches(c)));
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

describe("Core v2 — initiative & action coherence behavioral contract", () => {
  it("system instructions enforce truthful action and goal-directed initiative principles", async () => {
    const { CORE_V2_SYSTEM_INSTRUCTION } = await import("../provider/prompt.js");
    const { R3_SYSTEM_INSTRUCTION } = await import("../provider/semantic-claim.js");

    for (const prompt of [CORE_V2_SYSTEM_INSTRUCTION, R3_SYSTEM_INSTRUCTION]) {
      assert.ok(prompt.includes("TIKRI VEIKSMAI IR INTEGRALUMAS"), "prompt must mandate truthful action coherence");
      assert.ok(prompt.includes("TIKSLINGA INICIATYVA"), "prompt must mandate goal-directed initiative");
      assert.ok(prompt.includes("Nesakyk tekste ir neteik, kad atlieki, pradedi, vykdai paiešką"), "prompt must forbid false future/action claims");
    }
  });

  it("decision contract allows simultaneous text, claims, clarification, and capabilityRequest", () => {
    const semDec: SemanticDecision = {
      text: "Paieškosiu šeimai patikimų automobilių iki 20 000 €.",
      claims: [
        { role: "goal", value: "šeimos automobilis" },
        { role: "preference", label: "patikimumas" },
        { role: "constraint", concept: "price", boundary: "max", value: 20000, strength: "hard" },
      ],
      capabilityRequest: { capability: "searchListings", args: {} },
    };
    const mapped = semanticDecisionToReasoningDecision(semDec);
    assert.equal(mapped.text, semDec.text);
    assert.ok(mapped.statePatches && mapped.statePatches.length === 3);
    assert.deepEqual(mapped.capabilityRequest, semDec.capabilityRequest);
  });

  it("material clarification remains possible when required info is missing", () => {
    const semDec: SemanticDecision = {
      text: "Koks jūsų biudžetas?",
      clarification: "Kokia būtų maksimali suma, kurią planuojate skirti?",
    };
    const mapped = semanticDecisionToReasoningDecision(semDec);
    assert.equal(mapped.text, "Koks jūsų biudžetas?");
    assert.equal(mapped.clarification, "Kokia būtų maksimali suma, kurią planuojate skirti?");
    assert.equal(mapped.capabilityRequest, undefined);
  });
});

describe("Core v2 — phase-aware contract invariants", () => {
  it("1. explicit direct-response decision returns direct text without capability", async () => {
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: r3Provider({ actionKind: "direct", text: "Labas, kuo galiu padėti?" }),
      registry: reg,
      input: input(),
    });
    assert.equal(res.decision.text, "Labas, kuo galiu padėti?");
    assert.equal(res.capabilityCalls.length, 0);
  });

  it("2. explicit clarification decision returns clarification without capability", async () => {
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: r3Provider({ actionKind: "clarify", clarification: "Kokia biudžeto riba?" }),
      registry: reg,
      input: input(),
    });
    assert.equal(res.decision.clarification, "Kokia biudžeto riba?");
    assert.equal(res.capabilityCalls.length, 0);
  });

  it("3. capability decision cannot become final visible result before execution", () => {
    assert.throws(
      () => parseSemanticDecision({ actionKind: "capability" }),
      (err: unknown) => err instanceof Error && err.message.includes("requires a valid capabilityRequest")
    );
    assert.throws(
      () => parseSemanticDecision({ actionKind: "direct", capabilityRequest: { capability: "searchListings", args: {} } }),
      (err: unknown) => err instanceof Error && err.message.includes("cannot include capabilityRequest")
    );
  });

  it("4. successful capability result is supplied to response reasoning before visible final answer", async () => {
    let step = 0;
    let receivedGrounded: string | undefined;
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: async (inp) => {
        if (step++ === 0) {
          return { actionKind: "capability", capabilityRequest: { capability: "searchListings", args: {} } };
        }
        receivedGrounded = inp.groundedResults?.[0]?.summary;
        return { actionKind: "direct", text: `Gautas atsakymas: ${receivedGrounded}` };
      },
      registry: reg,
      input: input(),
    });
    assert.equal(res.iterations, 2);
    assert.ok(receivedGrounded && receivedGrounded.includes("rasta"));
    assert.equal(res.decision.text, `Gautas atsakymas: ${receivedGrounded}`);
  });

  it("5. capability failure cannot be narrated as successful execution", async () => {
    let step = 0;
    let receivedError: string | undefined;
    const reg = registry();
    const res = await runMultiStepLoop({
      provider: async (inp) => {
        if (step++ === 0) {
          return { actionKind: "capability", capabilityRequest: { capability: "unknownCap", args: {} } };
        }
        receivedError = inp.groundedResults?.[0]?.error;
        return { actionKind: "direct", text: `Įvyko klaida: ${receivedError}` };
      },
      registry: reg,
      input: input(),
    });
    assert.equal(res.capabilityCalls[0]?.ok, false);
    assert.equal(receivedError, "unknown_capability");
    assert.equal(res.decision.text, "Įvyko klaida: unknown_capability");
  });
});


