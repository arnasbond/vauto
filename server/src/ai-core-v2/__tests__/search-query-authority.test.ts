/**
 * VAUTO AI Core v2.2A — search QUERY authority. The model's free-text query
 * is NOT retrieval authority; only a USER_STATED search subject may influence
 * retrieval. MODEL_INFERRED, TOOL_DERIVED, and soft preferences never become
 * the executable query.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleSearchSubject,
} from "../state/marketplace-state.js";
import { setHardConstraint, setSearchSubject } from "../state/state-transitions.js";

describe("Core v2.2A — search query authority", () => {
  it("A: model-invented subject (Toyota SUV) does NOT enter executable query", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    // Model proposes a search with an invented query + inferred subject.
    const args = deriveSearchListingsArgs(s, { query: "Toyota SUV family reliable" });
    assert.equal(args.query, undefined, "no user-stated subject → no query");
    assert.equal(args.maxPrice, 20000, "user budget still applies");
  });

  it("B: user-stated subject (Toyota) IS execution-eligible", () => {
    let s = emptyMarketplaceState();
    s = setSearchSubject(s, "Toyota", provenance("USER_STATED"));
    const args = deriveSearchListingsArgs(s, { query: "ignored invented text" });
    assert.equal(args.query, "Toyota", "user-stated subject wins");
  });

  it("C: soft preference (reliable family) never becomes the query", () => {
    let s = emptyMarketplaceState();
    // soft preferences are NOT the search subject; model text is ignored.
    const args = deriveSearchListingsArgs(s, { query: "reliable family vehicle" });
    assert.equal(args.query, undefined);
  });

  it("D: TOOL_DERIVED fact (diesel) is not user search intent", () => {
    let s = emptyMarketplaceState();
    s = setSearchSubject(s, "diesel", provenance("TOOL_DERIVED"));
    assert.equal(executionEligibleSearchSubject(s), undefined);
    assert.equal(deriveSearchListingsArgs(s, {}).query, undefined);
  });

  it("E: arbitrary model query is ignored (execution authority from state only)", () => {
    let s = emptyMarketplaceState();
    const args = deriveSearchListingsArgs(s, { query: "anything at all" });
    assert.equal(args.query, undefined);
    assert.deepEqual(args, { query: undefined, category: undefined, city: undefined, minPrice: undefined, maxPrice: undefined, limit: undefined });
  });

  it("removeSearchSubject clears the subject", () => {
    let s = emptyMarketplaceState();
    s = setSearchSubject(s, "Toyota", provenance("USER_STATED"));
    assert.equal(executionEligibleSearchSubject(s), "Toyota");
    s = { ...s, searchSubject: undefined, searchSubjectProvenance: undefined };
    assert.equal(executionEligibleSearchSubject(s), undefined);
  });
});
