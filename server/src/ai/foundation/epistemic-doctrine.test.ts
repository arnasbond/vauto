/**
 * FAIL-FIRST — epistemic maturity + capability routing.
 *
 * DF-B1 (hallucinated listing facts) and DF-B2 (Omniva/parcel leakage into
 * real_estate) are resolved by a UNIVERSAL epistemic doctrine and by aligning
 * the conversational Omniva rule with the deterministic HARD_BLOCK_CATEGORIES
 * capability fence.
 *
 * RED before fix:
 *   - the supervisor prompt still carries the contradictory blanket
 *     "praturtink proaktyviai / MASTER SALES COPYWRITER / DRAUDŽIAMA palikti
 *     tuščią aprašymą" doctrine that orders the model to fabricate rich facts;
 *   - no epistemic provenance rule (FACT / INFERENCE / UNKNOWN);
 *   - no real_estate fact/capability context;
 *   - the Omniva prompt rule is category-blind.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSupervisorSystemInstruction } from "../supervisor-system-instruction.js";
import { buildVautoAgentSystemInstruction } from "../agent-system-instruction.js";
import {
  resolveOmnivaLockerEligibility,
  applyOmnivaEligibilityToDraft,
} from "../../shared/omniva-locker-eligibility.js";

const SUPERVISOR = buildSupervisorSystemInstruction();
const FULL = buildVautoAgentSystemInstruction("full");

describe("B — epistemic doctrine replaces the fabricate-rich-facts doctrine", () => {
  it("establishes FACT / INFERENCE / UNKNOWN provenance", () => {
    assert.match(SUPERVISOR, /FAKTO PROVENANCIJA|EPISTEMIN/i);
    assert.match(SUPERVISOR, /FAKTAS/i);
    assert.match(SUPERVISOR, /IŠVADA/i);
    assert.match(SUPERVISOR, /NEŽINOMA/i);
  });

  it("unknown facts must ask or stay absent, not become asserted facts", () => {
    assert.match(SUPERVISOR, /NEteigk kaip fakto/i);
    assert.match(SUPERVISOR, /NEišgalvok/i);
  });

  it("creative copy may polish known facts but not manufacture item/property qualities", () => {
    assert.match(
      SUPERVISOR,
      /NEGALI išgalvoti daikto .*savybių|negali išgalvoti.*savybi|neturi išgalvoti.*savyb/i
    );
  });

  it("REMOVES the contradictory blanket 'enrich proactively' order (full turn)", () => {
    assert.ok(!/Aprašymą ir specs — TAIP, praturtink proaktyviai/i.test(FULL));
    assert.ok(!/description\/title\/specs — praturtink proaktyviai/i.test(FULL));
  });

  it("REMOVES the 'never leave empty description' fabrication trigger", () => {
    assert.ok(!/DRAUDŽIAMA palikti tuščią ar 1 sakinio aprašymą/i.test(SUPERVISOR));
  });
});

describe("B — real_estate vertical fact context", () => {
  it("real_estate fact fields are declared UNKNOWN until grounded", () => {
    assert.match(SUPERVISOR, /real_estate/i);
    assert.match(SUPERVISOR, /plotas|m²/i);
    assert.match(SUPERVISOR, /kambariai/i);
    assert.match(SUPERVISOR, /energijos klasė/i);
  });

  it("location/infrastructure/neighborhood qualities must not be invented for real_estate", () => {
    assert.match(SUPERVISOR, /infrastruktūra/i);
    assert.match(SUPERVISOR, /kaimynystė/i);
    assert.match(SUPERVISOR, /NEišgalvok/i);
  });
});

describe("C — Omniva capability boundary (conversational + deterministic)", () => {
  it("supervisor prompt gates Omniva to shippable categories only", () => {
    assert.match(SUPERVISOR, /TIK siunčiamom/i);
    assert.match(SUPERVISOR, /NESIUNČIAM/i);
  });

  it("supervisor prompt lists real_estate as never entering parcel logic", () => {
    assert.match(SUPERVISOR, /real_estate/i);
    assert.match(SUPERVISOR, /paštomat|siuntim/i);
  });

  it("deterministic fence hard-blocks real_estate (no parcel)", () => {
    const r = resolveOmnivaLockerEligibility({ category: "real_estate" });
    assert.equal(r.eligible, false);
    assert.equal(r.fitsOmnivaLocker, false);
    assert.equal(r.defaultShipping, "pickup_or_courier");
  });

  it("deterministic fence keeps parcel-capable electronics eligible", () => {
    const r = resolveOmnivaLockerEligibility({ category: "electronics" });
    assert.equal(r.eligible, true);
    assert.equal(r.fitsOmnivaLocker, true);
    assert.equal(r.defaultShipping, "locker");
  });

  it("deterministic fence keeps oversized shippable home item blocked by size, not category", () => {
    const r = resolveOmnivaLockerEligibility({
      category: "home",
      title: "Didelė sofa",
      attributes: { dimensions: "200x90x80" },
    });
    assert.equal(r.eligible, false);
    assert.equal(r.fitsOmnivaLocker, false);
  });

  it("applyOmnivaEligibilityToDraft stamps real_estate as non-locker", () => {
    const draft = applyOmnivaEligibilityToDraft({
      category: "real_estate",
      title: "2 kamb. butas",
      allowPastomatas: true,
      attributes: {},
    });
    assert.equal(draft.allowPastomatas, false);
    assert.equal(draft.attributes.fitsOmnivaLocker, "false");
  });
});
