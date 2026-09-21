/**
 * VAUTO AI Core v2.3 — authority grounding: EVIDENCE LOCATION != SEMANTIC
 * ENTAILMENT. The default verifier is deterministic + conservative
 * (continuity-only); a narrow model verifier may be injected. A model must
 * not self-grant USER_STATED execution authority.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groundStatePatches } from "../loop/grounding.js";
import { continuityVerifier, type AuthorityVerifier, type AuthorityVerdict } from "../loop/authority-verifier.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";
import type { StatePatch } from "../state/state-patch.js";

function mockVerifier(verdicts: AuthorityVerdict[]): AuthorityVerifier {
  let i = 0;
  return async () => verdicts[Math.min(i++, verdicts.length - 1)] ?? "UNSUPPORTED";
}

function src(patch: StatePatch | undefined): string | undefined {
  return (patch as { provenance?: { source?: string } } | undefined)?.provenance?.source;
}

describe("Core v2.3 — grounding (model cannot self-grant USER_STATED)", () => {
  it("5: prior verified state continuity is VERIFIED deterministically", async () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    const patch: StatePatch = { op: "setHard", key: "priceMax", value: 20000, provenance: provenance("USER_STATED") };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "o dabar parodyk", continuityVerifier);
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(src(accepted[0]), "USER_STATED");
  });

  it("6: model-invented value with no evidence/continuity is UNSUPPORTED", async () => {
    const s = emptyMarketplaceState();
    const patch: StatePatch = { op: "setSearchSubject", subject: "Toyota", provenance: provenance("USER_STATED") };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "šeimos automobilis", continuityVerifier);
    assert.equal(rejectedAuthority.length, 1);
    assert.equal(src(accepted[0]), "MODEL_INFERRED", "demoted");
  });

  it("1: normalized budget can become VERIFIED via an injected narrow verifier", async () => {
    const s = emptyMarketplaceState();
    const patch: StatePatch = { op: "setHard", key: "priceMax", value: 20000, provenance: provenance("USER_STATED"), evidence: "iki 20 tūkst." };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "iki 20 tūkst.", mockVerifier(["VERIFIED_USER_INTENT"]));
    assert.equal(rejectedAuthority.length, 0);
    assert.equal(src(accepted[0]), "USER_STATED");
  });

  it("2: negation (SUV nenoriu) is CONTRADICTED, not positive intent", async () => {
    const s = emptyMarketplaceState();
    const patch: StatePatch = { op: "setHard", key: "category", value: "vehicles", provenance: provenance("USER_STATED"), evidence: "SUV" };
    const { accepted, rejectedAuthority } = await groundStatePatches(s, [patch], "SUV nenoriu", mockVerifier(["CONTRADICTED"]));
    assert.equal(rejectedAuthority.length, 1);
    assert.equal(src(accepted[0]), "MODEL_INFERRED", "negation demoted");
  });

  it("3: declension (Kaune → Kaunas) is supported via the verifier, not a declension rule", async () => {
    const s = emptyMarketplaceState();
    const patch: StatePatch = { op: "setHard", key: "location", value: "Kaunas", provenance: provenance("USER_STATED"), evidence: "Kaune" };
    const { accepted } = await groundStatePatches(s, [patch], "butas Kaune", mockVerifier(["VERIFIED_USER_INTENT"]));
    assert.equal(src(accepted[0]), "USER_STATED");
  });

  it("4: typo/shorthand budget is not phrase-whitelisted", async () => {
    const s = emptyMarketplaceState();
    const patch: StatePatch = { op: "setHard", key: "priceMax", value: 400, provenance: provenance("USER_STATED"), evidence: "iki 400 eur" };
    const { accepted } = await groundStatePatches(s, [patch], "iki 400 eur", mockVerifier(["VERIFIED_USER_INTENT"]));
    assert.equal(src(accepted[0]), "USER_STATED");
  });
});
