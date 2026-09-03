/**
 * F9 — canonical fact-conflict architecture across the agent tool boundary.
 *
 * Marker convention: `${field}Conflict` = "true" + `${field}ConflictCandidate`
 * (mirrors the certified year/rooms/workType reducers). Lifecycle is
 * deterministic; conflicting values never silently overwrite the canonical
 * fact; nested model attributes can never bypass the user's text.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";
import {
  buildSellListingDraftFallback,
  extractPriceFromSellText,
} from "../sell-intent-fallback.js";
import {
  readActiveFactConflict,
  buildFactConflictQuestion,
  resolveFactConflictState,
  normalizePriceValue,
  normalizeCityValue,
  normalizeConditionValue,
} from "../../shared/fact-conflict.js";

const BENCHMARK =
  "Noriu sukurti bandomąjį skelbimo juodraštį, bet jo nepublikuoti: juoda USB klaviatūra, naudota, pilnai veikia, kaina 15 eurų, Kaišiadorys.";

const ctx: AgentToolContext = {
  userCity: "Vilnius",
  userRole: "seller",
  contact: "",
  lastUserQuery: BENCHMARK,
};

type DraftSideEffect = {
  type: "listing_draft";
  listingDraft: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
};

type DraftToolResult = {
  result: { message?: string; draft?: DraftSideEffect["listingDraft"] };
  sideEffect?: DraftSideEffect;
};

const draftOf = (r: { sideEffect?: unknown }): DraftSideEffect["listingDraft"] => {
  assert.ok(r.sideEffect, "expected listing_draft side effect");
  const se = r.sideEffect as DraftSideEffect;
  assert.equal(se.type, "listing_draft");
  return se.listingDraft;
};

describe("F9 — faktų autoritetas (create_listing_draft)", () => {
  it("tekstas „15 eurų, Kaišiadorys“ + modelis „999, Kaunas“ → TIK tekstas", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        price: 999,
        city: "Kaunas",
      },
      ctx
    );
    const draft = draftOf(r);
    assert.equal(draft.price, 15, "999 neturi nugalėti teksto kainos");
    assert.equal(draft.location, "Kaišiadorys");
    assert.doesNotMatch(draft.location ?? "", /Kaunas/);
  });

  it("tekstas „naudota“ + modelio top-level condition „Nauja“ → tekstas laimi", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        condition: "Nauja",
      },
      ctx
    );
    assert.equal(draftOf(r).attributes?.condition, "Naudota");
  });

  it("tekstas „naudota“ + modelio NESTED attributes.condition „Nauja“ → tekstas laimi (no bypass)", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        attributes: { condition: "Nauja", color: "juoda" },
      },
      ctx
    );
    const draft = draftOf(r);
    assert.equal(draft.attributes?.condition, "Naudota", "nested model condition must not bypass user text");
    assert.match(draft.attributes?.color ?? "", /juoda/, "plain nested attrs still merge");
  });

  it("nested attributes.price negali apeiti teksto kainos", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        attributes: { price: "777" },
      },
      ctx
    );
    assert.equal(draftOf(r).price, 15);
  });

  it("tekste fakto nėra → leidžiamas validus modelio argumentas", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        price: 20,
        city: "Kaunas",
        condition: "Nauja",
      },
      { ...ctx, lastUserQuery: "Juoda USB klaviatūra, pilnai veikia." }
    );
    const draft = draftOf(r);
    assert.equal(draft.price, 20);
    assert.equal(draft.location, "Kaunas");
    assert.equal(draft.attributes?.condition, "Nauja");
  });

  it("nėra nei teksto, nei modelio miesto → profilio fallback", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
      },
      { ...ctx, lastUserQuery: "Juoda USB klaviatūra." }
    );
    assert.equal(draftOf(r).location, "Vilnius");
  });

  it("malformed / NaN / negative / oversized modelio reikšmės atmetamos", async () => {
    const r = await executeAgentTool(
      "create_listing_draft",
      {
        title: "USB klaviatūra",
        category: "electronics",
        description: "klaviatūra",
        price: "ne kaina",
        city: "x".repeat(500),
        condition: 42,
      },
      { ...ctx, lastUserQuery: "Juoda USB klaviatūra." }
    );
    const draft = draftOf(r);
    assert.equal(draft.price, 0, "malformed price dropped");
    assert.equal(draft.location, "Vilnius", "oversized city dropped → profile");
    assert.equal(draft.attributes?.condition, undefined, "non-string condition dropped");
  });

  it("NaN/negative kaina atmetama net ir be teksto fakto", async () => {
    const nanRun = await executeAgentTool(
      "create_listing_draft",
      { title: "USB klaviatūra", category: "electronics", description: "k", price: NaN },
      { ...ctx, lastUserQuery: "Juoda USB klaviatūra." }
    );
    assert.equal(draftOf(nanRun).price, 0);
    const negRun = await executeAgentTool(
      "create_listing_draft",
      { title: "USB klaviatūra", category: "electronics", description: "k", price: -5 },
      { ...ctx, lastUserQuery: "Juoda USB klaviatūra." }
    );
    assert.equal(draftOf(negRun).price, 0);
  });
});

describe("F9 — konfliktų lifecycle (updateListingDraft)", () => {
  const baseDraft = {
    title: "USB klaviatūra",
    category: "electronics",
    price: 30,
    location: "Kaunas",
    attributes: { condition: "Nauja" },
  };

  it("A (canonical) → B (kandidatas): markeriai pagal kanoninę konvenciją", async () => {
    const r = (await executeAgentTool(
      "updateListingDraft",
      { price: 999, city: "Klaipėda", condition: "Naudota" },
      { ...ctx, lastUserQuery: "", listingDraft: baseDraft }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.price, 30, "canonical price preserved");
    assert.equal(draft.location, "Kaunas");
    assert.equal(draft.attributes?.condition, "Nauja");
    assert.equal(draft.attributes?.priceConflict, "true");
    assert.equal(draft.attributes?.priceConflictCandidate, "999");
    assert.equal(draft.attributes?.cityConflict, "true");
    assert.equal(draft.attributes?.cityConflictCandidate, "Klaipėda");
    assert.equal(draft.attributes?.conditionConflict, "true");
    assert.equal(draft.attributes?.conditionConflictCandidate, "Naudota");
    assert.match(String(r.result.message ?? ""), /prieštaravimą/);
  });

  it("vartotojas pasirenka A → konfliktas išsprendžiamas, markeriai pašalinami", async () => {
    const conflicted = {
      ...baseDraft,
      attributes: {
        condition: "Nauja",
        priceConflict: "true",
        priceConflictCandidate: "999",
      },
    };
    const r = (await executeAgentTool(
      "updateListingDraft",
      {},
      { ...ctx, lastUserQuery: "kaina 30 eurų", listingDraft: conflicted }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.price, 30);
    assert.equal(draft.attributes?.priceConflict, undefined, "marker tombstoned");
    assert.equal(draft.attributes?.priceConflictCandidate, undefined);
  });

  it("vartotojas pasirenka B → B tampa canonical, markeriai pašalinami", async () => {
    const conflicted = {
      ...baseDraft,
      attributes: {
        condition: "Nauja",
        priceConflict: "true",
        priceConflictCandidate: "999",
      },
    };
    const r = (await executeAgentTool(
      "updateListingDraft",
      {},
      { ...ctx, lastUserQuery: "kaina 999 eurų", listingDraft: conflicted }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.price, 999);
    assert.equal(draft.attributes?.priceConflict, undefined);
    assert.equal(draft.attributes?.priceConflictCandidate, undefined);
  });

  it("trečia C reikšmė konflikto tyliai neišsprendžia", async () => {
    const conflicted = {
      ...baseDraft,
      attributes: {
        condition: "Nauja",
        priceConflict: "true",
        priceConflictCandidate: "999",
      },
    };
    const r = (await executeAgentTool(
      "updateListingDraft",
      {},
      { ...ctx, lastUserQuery: "kaina 555 eurų", listingDraft: conflicted }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.price, 30, "canonical untouched by third value");
    assert.equal(draft.attributes?.priceConflict, "true");
    assert.equal(draft.attributes?.priceConflictCandidate, "999", "original candidate preserved");
  });

  it("nesusijęs turnas (be fakto) aktyvaus konflikto neištrina", async () => {
    const conflicted = {
      ...baseDraft,
      attributes: {
        condition: "Nauja",
        priceConflict: "true",
        priceConflictCandidate: "999",
      },
    };
    const r = (await executeAgentTool(
      "updateListingDraft",
      { description: "pataisytas aprašymas" },
      { ...ctx, lastUserQuery: "Papildyk aprašymą.", listingDraft: conflicted }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.attributes?.priceConflict, "true");
    assert.equal(draft.attributes?.priceConflictCandidate, "999");
  });

  it("semantiškai vienoda reikšmė konflikto nesukuria (kaunas vs Kaunas)", async () => {
    const r = (await executeAgentTool(
      "updateListingDraft",
      { city: "kaunas" },
      { ...ctx, lastUserQuery: "", listingDraft: baseDraft }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.location, "Kaunas");
    assert.equal(draft.attributes?.cityConflict, undefined);
  });

  it("semantiškai vienoda būklė konflikto nesukuria (naudotas → Naudota)", async () => {
    const draftBase = { ...baseDraft, attributes: { condition: "Naudota" } };
    const r = (await executeAgentTool(
      "updateListingDraft",
      { condition: "naudotas" },
      { ...ctx, lastUserQuery: "", listingDraft: draftBase }
    )) as DraftToolResult;
    const draft = draftOf(r);
    assert.equal(draft.attributes?.condition, "Naudota");
    assert.equal(draft.attributes?.conditionConflict, undefined);
  });

  it("malformed markeriai nesuteikia autoriteto (fail-closed)", async () => {
    const malformed = {
      ...baseDraft,
      attributes: {
        condition: "Nauja",
        priceConflict: "maybe",
        priceConflictCandidate: "",
      },
    };
    const r = (await executeAgentTool(
      "updateListingDraft",
      { price: 12 },
      { ...ctx, lastUserQuery: "", listingDraft: malformed }
    )) as DraftToolResult;
    const draft = draftOf(r);
    // Malformed markers never manufacture an ACTIVE conflict — the valid
    // prior canonical (30) keeps its authority: the new 12 opens a FRESH
    // valid conflict instead of being silently accepted.
    assert.equal(draft.price, 30);
    assert.equal(draft.attributes?.priceConflict, "true");
    assert.equal(draft.attributes?.priceConflictCandidate, "12");
  });
});

describe("F9 — žmogaus autoriteto riba (aktyvaus konflikto metu)", () => {
  const conflictedPrice = {
    title: "USB klaviatūra",
    category: "electronics",
    price: 15,
    location: "Kaišiadorys",
    attributes: {
      condition: "Naudota",
      priceConflict: "true",
      priceConflictCandidate: "999",
    },
  };
  const conflictedCity = {
    title: "USB klaviatūra",
    category: "electronics",
    price: 15,
    location: "Kaunas",
    attributes: {
      condition: "Naudota",
      cityConflict: "true",
      cityConflictCandidate: "Vilnius",
    },
  };
  const conflictedCondition = {
    title: "USB klaviatūra",
    category: "electronics",
    price: 15,
    location: "Kaišiadorys",
    attributes: {
      condition: "Nauja",
      conditionConflict: "true",
      conditionConflictCandidate: "Naudota",
    },
  };

  const assertConflictPreserved = (
    draft: DraftSideEffect["listingDraft"],
    field: "price" | "city" | "condition"
  ) => {
    assert.equal(
      (draft.attributes ?? {})[`${field}Conflict`],
      "true",
      `${field} conflict must remain active`
    );
    if (field === "price") {
      assert.equal(draft.price, 15);
      assert.equal(draft.attributes?.priceConflictCandidate, "999");
    } else if (field === "city") {
      assert.equal(draft.location, "Kaunas");
      assert.equal(draft.attributes?.cityConflictCandidate, "Vilnius");
    } else {
      assert.equal(draft.attributes?.condition, "Nauja");
      assert.equal(draft.attributes?.conditionConflictCandidate, "Naudota");
    }
  };

  for (const { name, base, field, modelArgs, unrelatedText } of [
    {
      name: "price",
      base: conflictedPrice,
      field: "price" as const,
      modelArgs: { price: 15 },
      unrelatedText: "Pataisykite aprašymą.",
    },
    {
      name: "city",
      base: conflictedCity,
      field: "city" as const,
      modelArgs: { city: "Vilnius" },
      unrelatedText: "Pataisykite aprašymą.",
    },
    {
      name: "condition",
      base: conflictedCondition,
      field: "condition" as const,
      modelArgs: { condition: "Naudota" },
      unrelatedText: "Pataisykite aprašymą.",
    },
  ]) {
    it(`modelis kartoja candidate B (${name}) + nesusijęs tekstas → konfliktas lieka`, async () => {
      const r = (await executeAgentTool(
        "updateListingDraft",
        modelArgs,
        { ...ctx, lastUserQuery: unrelatedText, listingDraft: base }
      )) as DraftToolResult;
      assertConflictPreserved(draftOf(r), field);
      assert.match(String(r.result.message ?? ""), /prieštaravimą/);
    });

    it(`modelis kartoja canonical A (${name}) + nesusijęs tekstas → konfliktas lieka`, async () => {
      const canonicalArgs =
        field === "price"
          ? { price: 15 }
          : field === "city"
            ? { city: "Kaunas" }
            : { condition: "Nauja" };
      const r = (await executeAgentTool(
        "updateListingDraft",
        canonicalArgs,
        { ...ctx, lastUserQuery: unrelatedText, listingDraft: base }
      )) as DraftToolResult;
      assertConflictPreserved(draftOf(r), field);
    });

    it(`modelio trečia C (${name}) + nesusijęs tekstas → konfliktas lieka`, async () => {
      const thirdArgs =
        field === "price"
          ? { price: 555 }
          : field === "city"
            ? { city: "Klaipėda" }
            : { condition: "Beveik nauja" };
      const r = (await executeAgentTool(
        "updateListingDraft",
        thirdArgs,
        { ...ctx, lastUserQuery: unrelatedText, listingDraft: base }
      )) as DraftToolResult;
      assertConflictPreserved(draftOf(r), field);
    });

    it(`aiškus vartotojo pasirinkimas A (${name}) → konfliktas išsprendžiamas`, async () => {
      const textA =
        field === "price"
          ? "kaina 15 eurų"
          : field === "city"
            ? "miestas Kaunas"
            : "būklė Nauja";
      const r = (await executeAgentTool(
        "updateListingDraft",
        {},
        { ...ctx, lastUserQuery: textA, listingDraft: base }
      )) as DraftToolResult;
      const draft = draftOf(r);
      assert.equal(
        (draft.attributes ?? {})[`${field}Conflict`],
        undefined,
        `${field} markers resolved`
      );
      assert.equal(
        (draft.attributes ?? {})[`${field}ConflictCandidate`],
        undefined
      );
    });

    it(`aiškus vartotojo pasirinkimas B (${name}) → konfliktas išsprendžiamas`, async () => {
      const textB =
        field === "price"
          ? "kaina 999 eurų"
          : field === "city"
            ? "miestas Vilnius"
            : "būklė Naudota";
      const r = (await executeAgentTool(
        "updateListingDraft",
        {},
        { ...ctx, lastUserQuery: textB, listingDraft: base }
      )) as DraftToolResult;
      const draft = draftOf(r);
      assert.equal((draft.attributes ?? {})[`${field}Conflict`], undefined);
      if (field === "price") {
        assert.equal(draft.price, 999);
      } else if (field === "city") {
        assert.equal(draft.location, "Vilnius");
      } else {
        assert.equal(draft.attributes?.condition, "Naudota");
      }
    });
  }

  it("modelio malformed argumentas nesuteikia autoriteto", async () => {
    const r = (await executeAgentTool(
      "updateListingDraft",
      { price: NaN },
      { ...ctx, lastUserQuery: "Pataisykite aprašymą.", listingDraft: conflictedPrice }
    )) as DraftToolResult;
    assertConflictPreserved(draftOf(r), "price");
  });

  it("modelis negali perrašyti/panaikinti konflikto markerių per nested attributes", async () => {
    const r = (await executeAgentTool(
      "updateListingDraft",
      {
        attributes: {
          priceConflict: "",
          priceConflictCandidate: "1",
        },
      },
      { ...ctx, lastUserQuery: "Pataisykite aprašymą.", listingDraft: conflictedPrice }
    )) as DraftToolResult;
    const draft = draftOf(r);
    // Untrusted ingress is stripped: markers stay exactly as before.
    assert.equal(draft.attributes?.priceConflict, "true");
    assert.equal(draft.attributes?.priceConflictCandidate, "999");
  });

  it("modelio bandymas neišsprendžia — pre-publish kortelei blokuojantys markeriai lieka", async () => {
    const r = (await executeAgentTool(
      "updateListingDraft",
      { price: 15 },
      { ...ctx, lastUserQuery: "Pataisykite aprašymą.", listingDraft: conflictedPrice }
    )) as DraftToolResult;
    const draft = draftOf(r);
    const active = readActiveFactConflict({
      ...(draft.attributes ?? {}),
      price: draft.price,
      city: draft.location,
      condition: draft.attributes?.condition,
    });
    assert.ok(active, "conflict must remain active after a model-only attempt");
    assert.equal(active.field, "price");
  });
});

describe("F9 — kanoninis reducer + typed klausimas", () => {
  it("resolveFactConflictState lifecycle: pirmas faktas → canonical", () => {
    const p1 = resolveFactConflictState({ field: "price", priorAttributes: {}, incomingValue: 15 });
    assert.deepEqual(p1.patch, { price: 15 });
  });

  it("A → B atidaro konfliktą; B → B jį išsprendžia", () => {
    const open = resolveFactConflictState({
      field: "condition",
      priorAttributes: { condition: "Nauja" },
      incomingValue: "Naudota",
    });
    assert.deepEqual(open.patch, {
      condition: "Nauja",
      conditionConflict: "true",
      conditionConflictCandidate: "Naudota",
    });
    const resolveB = resolveFactConflictState({
      field: "condition",
      priorAttributes: { ...open.patch },
      incomingValue: "Naudota",
    });
    assert.deepEqual(resolveB.patch, {
      condition: "Naudota",
      conditionConflict: "",
      conditionConflictCandidate: "",
    });
  });

  it("readActiveFactConflict + buildFactConflictQuestion — tipuotas, be delimiterių", () => {
    const c = readActiveFactConflict({
      price: 30,
      priceConflict: "true",
      priceConflictCandidate: "999",
    });
    assert.ok(c);
    assert.equal(c.field, "price");
    assert.equal(c.canonical, 30);
    assert.equal(c.candidate, 999);
    const q = buildFactConflictQuestion(c);
    assert.match(q, /kainą/);
    assert.match(q, /999/);
    assert.match(q, /30/);
    assert.doesNotMatch(q, /\|/);
    assert.doesNotMatch(q, /JSON/);
  });

  it("malformed markeriai skaitomi fail-closed", () => {
    assert.equal(
      readActiveFactConflict({ price: 30, priceConflict: "true", priceConflictCandidate: "" }),
      null
    );
    assert.equal(
      readActiveFactConflict({ price: 30, priceConflict: "yes", priceConflictCandidate: "999" }),
      null
    );
    assert.equal(
      readActiveFactConflict({ priceConflict: "true", priceConflictCandidate: "999" }),
      null
    );
  });

  it("normalizatoriai: price / city / condition", () => {
    assert.equal(normalizePriceValue(15), 15);
    assert.equal(normalizePriceValue("15,00"), 15);
    assert.equal(normalizePriceValue(Infinity), undefined);
    assert.equal(normalizePriceValue(-1), undefined);
    assert.equal(normalizePriceValue("n/a"), undefined);
    assert.equal(normalizeCityValue("  Kaunas "), "Kaunas");
    assert.equal(normalizeCityValue("x".repeat(200)), undefined);
    assert.equal(normalizeConditionValue("naudotas"), "Naudota");
    assert.equal(normalizeConditionValue("Used"), "Naudota");
    assert.equal(normalizeConditionValue("naujas"), "Nauja");
    assert.equal(normalizeConditionValue("beveik naujas"), "Beveik nauja");
    assert.equal(normalizeConditionValue("random"), undefined);
  });
});

describe("F9 — fallback faktai", () => {
  it("buildSellListingDraftFallback išlaiko kainą ir būklę", () => {
    const out = buildSellListingDraftFallback(BENCHMARK, { userCity: "Vilnius" });
    assert.equal(out.action.listingDraft.price, 15);
    assert.equal(out.action.listingDraft.attributes.condition, "Naudota");
    assert.equal(extractPriceFromSellText("kaina 15 eurų"), 15);
    assert.equal(extractPriceFromSellText("be kainos"), 0);
  });
});
