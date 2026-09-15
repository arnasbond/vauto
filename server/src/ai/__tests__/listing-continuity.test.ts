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

  it("end-to-end: non-vehicle draft preserves facts across conversational enrichment and correction turns", async () => {
    const { setPlannerDecisionProviderForTests } = await import("../planner/planner-orchestrator.js");
    const { runVautoAgent } = await import("../vauto-agent.js");

    setPlannerDecisionProviderForTests(async (input) => {
      if (input.lastUserText === "uosis") {
        return { intent: "sell_update" };
      }
      return {
        intent: "sell_update",
        toolArgs: {
          attributes: { details: input.lastUserText.replace(/^(?:ne,\s*suklydau,\s*)/i, "").trim() },
        },
      };
    });

    try {
      const initialDraft = {
        id: "draft-furn-42",
        title: "Medinis stalas",
        category: "home",
        price: 150,
        location: "Vilnius",
        description: "Parduodu medinį stalą",
        attributes: { condition: "Naudotas" },
        listingFlowState: "DRAFT_READY" as const,
      };

      // Turn 1: Conversational enrichment ("su 4 kėdėmis, ąžuolas")
      const res1 = await runVautoAgent({
        messages: [{ role: "user", text: "su 4 kėdėmis, ąžuolas" }],
        authUserId: "usr-cont-test",
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060012345",
          listingDraft: initialDraft,
        },
      });

      assert.equal(res1.ok, true);
      assert.equal(res1.actions?.type, "listing_draft");
      const d1 = res1.actions.listingDraft as typeof initialDraft;
      assert.equal(d1.id, "draft-furn-42", "same draft ID preserved");
      assert.equal(d1.title, "Medinis stalas", "title preserved");
      assert.equal(d1.category, "home", "category preserved");
      assert.equal(d1.price, 150, "price preserved");
      assert.ok(d1.description.includes("su 4 kėdėmis, ąžuolas"), "description enriched with new facts");
      assert.equal(d1.attributes?.details, "su 4 kėdėmis, ąžuolas", "attributes.details enriched");
      assert.ok(
        res1.reply.includes("Puiku — atnaujinau") || res1.reply.includes("Supratau — atnaujinau"),
        "reply truthfully indicates update"
      );
      assert.equal(
        res1.toolCalls?.some((tc) => tc.name === "updateListingDraft"),
        true,
        "updateListingDraft recorded when draft changed"
      );

      // Turn 2: Human correction replaces prior fact ("ne, suklydau, uosis")
      const res2 = await runVautoAgent({
        messages: [
          { role: "user", text: "su 4 kėdėmis, ąžuolas" },
          { role: "assistant", text: res1.reply },
          { role: "user", text: "ne, suklydau, uosis" },
        ],
        authUserId: "usr-cont-test",
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060012345",
          listingDraft: d1,
        },
      });

      assert.equal(res2.ok, true);
      assert.equal(res2.actions?.type, "listing_draft");
      const d2 = res2.actions.listingDraft as typeof initialDraft;
      assert.equal(d2.id, "draft-furn-42", "same draft ID preserved");
      assert.equal(d2.attributes?.details, "uosis", "correction replaced prior material fact in attributes");
      assert.ok(d2.description.includes("uosis"), "description contains corrected fact");
      assert.ok(!d2.description.includes("ąžuolas"), "prior erroneous fact was replaced, not concatenated");

      // Turn 3: Response truthfulness on no-op / unchanged turn
      const res3 = await runVautoAgent({
        messages: [
          { role: "user", text: "ne, suklydau, uosis" },
          { role: "assistant", text: res2.reply },
          { role: "user", text: "uosis" },
        ],
        authUserId: "usr-cont-test",
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060012345",
          listingDraft: d2,
        },
      });

      assert.equal(res3.ok, true);
      assert.ok(
        !res3.reply.includes("Puiku — atnaujinau juodraštį!"),
        "truthful: does not claim draft update when state did not change"
      );
    } finally {
      setPlannerDecisionProviderForTests(null);
    }
  });

  it("cross-vertical isolation: non-vehicle drafts do not receive vehicle specs", async () => {
    const { runVautoAgent } = await import("../vauto-agent.js");

    const clothingDraft = {
      id: "draft-cloth-1",
      title: "Zara striukė",
      category: "clothing",
      price: 45,
      location: "Kaunas",
      description: "Puiki demisezoninė striukė.",
      attributes: { size: "M", condition: "Labai gera" },
      listingFlowState: "DRAFT_READY" as const,
    };

    const res = await runVautoAgent({
      messages: [{ role: "user", text: "2.0l dyzelis 110kw rida 150000" }],
      authUserId: "usr-cloth-test",
      context: {
        isAuthenticated: true,
        userCity: "Kaunas",
        contact: "+37060012345",
        listingDraft: clothingDraft,
      },
    });

    assert.equal(res.ok, true);
    if (res.actions?.type === "listing_draft") {
      const d = res.actions.listingDraft as typeof clothingDraft;
      assert.equal(d.attributes?.make, undefined, "no vehicle make pollution");
      assert.equal(d.attributes?.engine, undefined, "no vehicle engine pollution");
      assert.equal(d.attributes?.fuelType, undefined, "no vehicle fuelType pollution");
      assert.equal(d.attributes?.mileage, undefined, "no vehicle mileage pollution");
    }
  });
});
