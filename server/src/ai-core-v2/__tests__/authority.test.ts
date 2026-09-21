/**
 * VAUTO AI Core v2 — hard-constraint authority: FACTUAL AUTHORITY != USER
 * INTENT AUTHORITY. Only USER_STATED values are execution-eligible hard
 * filters; model inference and grounded facts enrich state but never narrow
 * a tool query.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyMarketplaceState,
  executionEligibleHardConstraints,
  constraintAuthority,
  isExecutionEligible,
  provenance,
} from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";

describe("Core v2 — hard-constraint authority", () => {
  it("MODEL_INFERRED value is NOT execution-eligible", () => {
    const p = provenance("MODEL_INFERRED", 0.8);
    assert.equal(constraintAuthority(p), "MODEL_INFERENCE");
    assert.equal(isExecutionEligible(p), false);
  });

  it("TOOL_DERIVED / VISION / DOCUMENT facts are grounded but NOT user intent", () => {
    assert.equal(constraintAuthority(provenance("TOOL_DERIVED")), "GROUNDED_FACT");
    assert.equal(constraintAuthority(provenance("VISION_DERIVED")), "GROUNDED_FACT");
    assert.equal(constraintAuthority(provenance("DOCUMENT_DERIVED")), "GROUNDED_FACT");
    assert.equal(isExecutionEligible(provenance("TOOL_DERIVED")), false);
  });

  it("USER_STATED value IS execution-eligible", () => {
    assert.equal(constraintAuthority(provenance("USER_STATED")), "USER_INTENT");
    assert.equal(isExecutionEligible(provenance("USER_STATED")), true);
  });

  it("executionEligibleHardConstraints includes only user intent", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setHardConstraint(s, "category", "vehicles", provenance("MODEL_INFERRED", 0.7));
    s = setHardConstraint(s, "location", "Kaunas", provenance("TOOL_DERIVED"));

    const eligible = executionEligibleHardConstraints(s);
    assert.equal(eligible.priceMax, 20000, "explicit user budget is executable");
    assert.equal(eligible.category, undefined, "inferred category is NOT a hard filter");
    assert.equal(eligible.location, undefined, "tool fact is NOT user intent");
  });

  it("soft preferences never enter hard constraints", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 150000, provenance("USER_STATED"));
    const eligible = executionEligibleHardConstraints(s);
    assert.equal(Object.keys(eligible).includes("saugus"), false);
  });
});
