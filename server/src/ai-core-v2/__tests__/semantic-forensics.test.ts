/**
 * VAUTO AI Core v2.3R.7B — SEMANTIC CONTRACT FAILURE FORENSICS (deterministic).
 *
 * ZERO model/network calls. Traces the SAME canonical validation + claim-mapping
 * + grounding path used by the Arena, on locally-constructed examples only.
 *
 * Proves:
 *  - SemanticClaim expressiveness for replacement/retraction/preservation/simultaneous.
 *  - The exact ACCEPTED/REJECTED boundary (and reason) of validateStrict.
 *  - The authority invariant: malformed/unverified retraction NEVER removes state.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDecisionText, validateStrict, canonicalContractValid } from "../arena/transports.js";
import { parseSemanticDecision, claimsToPatches } from "../provider/semantic-claim.js";
import { groundStatePatches } from "../loop/grounding.js";
import { applyStatePatches, setHardConstraint } from "../state/state-transitions.js";
import { emptyMarketplaceState, provenance, type MarketplaceState } from "../state/marketplace-state.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";

function prior(): MarketplaceState {
  return setHardConstraint(setHardConstraint(emptyMarketplaceState(), "priceMax", 15000, provenance("USER_STATED")), "location", "Kaunas", provenance("USER_STATED"));
}

function patchesFor(raw: unknown) {
  return claimsToPatches(parseSemanticDecision(raw).claims);
}

const VERIFY_YES: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";
const VERIFY_NO: AuthorityVerifier = async () => "UNSUPPORTED";

describe("R7B forensics — SemanticClaim expressiveness", () => {
  it("A. replacement: priceMax 15000 -> 20000 (replaces, no accumulation)", () => {
    const patches = patchesFor({ claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000, strength: "hard" }] });
    assert.equal(patches.length, 1);
    const p = patches[0] as { op: string; key: string; value: unknown; provenance: { source: string } };
    assert.equal(p.op, "setHard");
    assert.equal(p.key, "priceMax");
    assert.equal(p.value, 20000);
    assert.equal(p.provenance.source, "USER_STATED");
    const final = applyStatePatches(prior(), patches);
    assert.equal(final.hardConstraints.priceMax, 20000, "replaced");
    assert.equal(final.hardConstraints.location, "Kaunas", "preserved");
    assert.equal(final.hardConstraintProvenance.priceMax?.source, "USER_STATED");
    assert.equal(Object.keys(final.hardConstraints).length, 2, "no stale accumulation");
  });

  it("B. retraction: remove priceMax (well-formed retraction claim)", async () => {
    const patches = patchesFor({ claims: [{ role: "retraction", target: "constraint", concept: "price", boundary: "max" }] });
    assert.deepEqual(patches.map((p) => p.op), ["removeHard"]);
    const grounded = await groundStatePatches(prior(), patches, "Biudžeto limito nebereikia.", VERIFY_YES);
    assert.equal(grounded.accepted.length, 1, "authoritative removal requires verifier approval");
    const final = applyStatePatches(prior(), grounded.accepted);
    assert.equal(final.hardConstraints.priceMax, undefined, "removed");
    assert.equal(final.hardConstraints.location, "Kaunas", "unrelated preserved");
  });

  it("C. preservation: location persists while price changes", () => {
    const patches = patchesFor({ claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000, strength: "hard" }] });
    const final = applyStatePatches(prior(), patches);
    assert.equal(final.hardConstraints.location, "Kaunas");
    assert.equal(final.hardConstraintProvenance.location?.source, "USER_STATED");
  });

  it("D. simultaneous: remove priceMax, preserve location", async () => {
    const patches = patchesFor({ claims: [{ role: "retraction", target: "constraint", concept: "price", boundary: "max" }] });
    const grounded = await groundStatePatches(prior(), patches, "Biudžeto limito nebereikia.", VERIFY_YES);
    const final = applyStatePatches(prior(), grounded.accepted);
    assert.equal(final.hardConstraints.priceMax, undefined, "budget removed");
    assert.equal(final.hardConstraints.location, "Kaunas", "location preserved");
  });
});

describe("R7B forensics — validation matrix (SAME validateStrict path)", () => {
  const cases: Array<{ name: string; json: unknown; expected: "ACCEPTED" | "REJECTED"; reason?: string }> = [
    { name: "missing optional strength", json: { claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000 }] }, expected: "ACCEPTED" },
    { name: "unexpected null role", json: { claims: [{ role: null }] }, expected: "ACCEPTED" },
    { name: "additional property", json: { claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000, foo: "bar" }] }, expected: "ACCEPTED" },
    { name: "well-formed replacement", json: { claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000, strength: "hard" }] }, expected: "ACCEPTED" },
    { name: "well-formed retraction", json: { claims: [{ role: "retraction", target: "constraint", concept: "price", boundary: "max" }] }, expected: "ACCEPTED" },
    { name: "wrong role enum", json: { claims: [{ role: "bogus" }] }, expected: "REJECTED", reason: "invalid role: bogus" },
    { name: "wrong target enum (retraction)", json: { claims: [{ role: "retraction", target: "budget" }] }, expected: "REJECTED", reason: "invalid target: budget" },
    { name: "wrong concept enum", json: { claims: [{ role: "constraint", concept: "budget" }] }, expected: "REJECTED", reason: "invalid concept: budget" },
    { name: "claims not array", json: { claims: "x" }, expected: "REJECTED", reason: "claims must be an array" },
    { name: "value not scalar (array)", json: { claims: [{ role: "constraint", value: [] }] }, expected: "REJECTED", reason: "value must be a scalar" },
    { name: "top-level not object", json: [{ role: "constraint" }], expected: "REJECTED", reason: "decision must be an object" },
    { name: "claim not object", json: { claims: [42] }, expected: "REJECTED", reason: "claim must be an object" },
  ];

  for (const c of cases) {
    it(`${c.name} => ${c.expected}`, () => {
      const raw = JSON.stringify(c.json);
      const parsed = parseDecisionText(raw);
      const strict = validateStrict(c.json);
      if (c.expected === "ACCEPTED") {
        assert.equal(parsed.error, undefined, `accepted; got error ${parsed.error?.code}`);
        assert.equal(strict, null);
        assert.equal(canonicalContractValid(raw), true);
      } else {
        assert.equal(parsed.error?.code, "schema_invalid");
        assert.equal(parsed.error?.reason, c.reason);
        assert.equal(strict, c.reason);
        assert.equal(canonicalContractValid(raw), false);
      }
    });
  }
});

describe("R7B forensics — authority invariant (retraction fail-closed)", () => {
  it("malformed retraction (invalid target) is rejected by validateStrict, never reaches mapping", () => {
    const parsed = parseDecisionText(JSON.stringify({ claims: [{ role: "retraction", target: "budget", concept: "price", boundary: "max" }] }));
    assert.equal(parsed.error?.code, "schema_invalid");
    assert.equal(parsed.error?.reason, "invalid target: budget");
    assert.equal(parsed.decision, null);
  });

  it("malformed retraction (dropped target) maps to NO removeHard patch", () => {
    const patches = patchesFor({ claims: [{ role: "retraction", target: "budget", concept: "price", boundary: "max" }] });
    assert.equal(patches.length, 0, "no state mutation from malformed retraction");
    const final = applyStatePatches(prior(), patches);
    assert.equal(final.hardConstraints.priceMax, 15000, "authoritative state preserved");
  });

  it("well-formed retraction with UNSUPPORTED verdict does NOT remove authoritative state", async () => {
    const patches = patchesFor({ claims: [{ role: "retraction", target: "constraint", concept: "price", boundary: "max" }] });
    const grounded = await groundStatePatches(prior(), patches, "Biudžeto limito nebereikia.", VERIFY_NO);
    assert.equal(grounded.accepted.length, 0, "rejected (fail-closed)");
    assert.equal(grounded.rejectedAuthority.length, 1);
    const final = applyStatePatches(prior(), grounded.accepted);
    assert.equal(final.hardConstraints.priceMax, 15000, "authoritative state preserved");
  });
});
