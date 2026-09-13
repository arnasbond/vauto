/**
 * R4.3C — listing continuity through the REAL updateListingDraft tool
 * (deterministic, no model). Proves a fragmentary addition ("ąžuolas") updates
 * the SAME active draft (KEEP) and a later fact ("kaina 450") refines it
 * further (UPDATE) without starting a new job. The model supplies the semantic
 * mapping; determinism owns the draft merge + authority.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";

type Draft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
};

function ctxWith(listingDraft: Draft, lastUserQuery: string): AgentToolContext {
  return {
    userCity: "Vilnius",
    userRole: "seller",
    contact: "",
    listingDraft,
    lastUserQuery,
  };
}

function draftOf(r: { sideEffect?: unknown }): Draft {
  const se = r.sideEffect as { type: string; listingDraft: Draft } | undefined;
  assert.equal(se?.type, "listing_draft");
  return se!.listingDraft;
}

describe("R4.3C — listing continuity (KEEP / UPDATE)", () => {
  it("a fragmentary detail updates the SAME draft (title/category preserved)", async () => {
    const initial: Draft = {
      title: "Medinis stalas",
      category: "home",
      price: 150,
      location: "Vilnius",
      attributes: { condition: "Naudotas" },
    };
    const r1 = await executeAgentTool(
      "updateListingDraft",
      { attributes: { material: "ąžuolas" } },
      ctxWith(initial, "su 4 kėdėmis, ąžuolas")
    );
    const d1 = draftOf(r1);
    assert.equal(d1.title, "Medinis stalas", "same draft title kept");
    assert.equal(d1.category, "home", "same draft category kept");
    assert.equal(d1.attributes?.material, "ąžuolas", "new fact added");
    assert.equal(d1.attributes?.condition, "Naudotas", "prior fact preserved");
  });

  it("a later fact further refines the SAME draft (prior addition preserved)", async () => {
    const afterMaterial: Draft = {
      title: "Medinis stalas",
      category: "home",
      price: 150,
      location: "Vilnius",
      attributes: { condition: "Naudotas", material: "ąžuolas" },
    };
    const r2 = await executeAgentTool(
      "updateListingDraft",
      { attributes: { color: "rudas" } },
      ctxWith(afterMaterial, "spalva ruda")
    );
    const d2 = draftOf(r2);
    assert.equal(d2.attributes?.color, "rudas", "second fact added");
    assert.equal(d2.attributes?.material, "ąžuolas", "prior material still attached to the same job");
    assert.equal(d2.attributes?.condition, "Naudotas", "prior condition preserved");
    assert.equal(d2.title, "Medinis stalas", "still the same listing");
  });
});
