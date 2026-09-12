/**
 * R4.1 — interpreted-state integrity & photo-first continuity.
 *
 * Determinism validates interpreted search state and preserves explicit human
 * authority; the model keeps owning interpretation/wording/initiative. These
 * are BEHAVIORAL tests of the pure authority/merge functions plus the
 * deterministic sell/create fallback (M3/M4) — not source-string assertions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFieldAuthority,
  mergeFieldAuthorityAttrs,
  markUserCorrectedField,
  isFieldUserCorrected,
  isHumanAuthoritativeSource,
  USER_CORRECTED_FIELDS_KEY,
} from "../../shared/field-authority.js";
import {
  resolveSearchCategory,
  resolveSearchPrice,
  resolveSearchCity,
} from "../search/search-authority.js";
import {
  detectServerSellIntent,
  buildSellClarificationReply,
} from "../sell-intent-fallback.js";

describe("R4.1 — field-authority (human correction outranks model/vision inference)", () => {
  it("an explicit USER_CORRECTION replaces a prior inference", () => {
    const r = resolveFieldAuthority(
      { value: "juoda", source: "VISUAL_OBSERVATION" },
      { value: "tamsiai mėlyna", source: "USER_CORRECTION" }
    );
    assert.equal(r.value, "tamsiai mėlyna");
    assert.equal(r.source, "USER_CORRECTION");
    assert.equal(r.conflict, false);
  });

  it("a human correction survives a later model/vision inference", () => {
    const r = resolveFieldAuthority(
      { value: "tamsiai mėlyna", source: "USER_CORRECTION" },
      { value: "juoda", source: "VISUAL_OBSERVATION" }
    );
    assert.equal(r.value, "tamsiai mėlyna");
    assert.equal(r.source, "USER_CORRECTION");
    assert.equal(r.conflict, false);
  });

  it("two different non-human values surface a conflict (never silent drop)", () => {
    const r = resolveFieldAuthority(
      { value: "juoda", source: "VISUAL_OBSERVATION" },
      { value: "ruda", source: "MODEL_INFERENCE" }
    );
    assert.equal(r.value, "ruda");
    assert.equal(r.conflict, true);
  });

  it("mergeFieldAuthorityAttrs keeps human-corrected fields and adds new evidence", () => {
    const prior = markUserCorrectedField(
      { color: "tamsiai mėlyna", material: "vilna" },
      "color"
    );
    const out = mergeFieldAuthorityAttrs(
      prior,
      { color: "juoda", material: "medvilnė", size: "L" },
      "VISUAL_OBSERVATION"
    );
    assert.equal(out.color, "tamsiai mėlyna", "human color survives");
    assert.equal(out.material, "medvilnė", "non-conflicting new evidence added");
    assert.equal(out.size, "L");
    assert.equal(isFieldUserCorrected(out, "color"), true);
    assert.equal(out[USER_CORRECTED_FIELDS_KEY], "color");
  });

  it("isHumanAuthoritativeSource recognizes only human sources", () => {
    assert.equal(isHumanAuthoritativeSource("USER_CORRECTION"), true);
    assert.equal(isHumanAuthoritativeSource("USER_CLAIM"), true);
    assert.equal(isHumanAuthoritativeSource("MODEL_INFERENCE"), false);
    assert.equal(isHumanAuthoritativeSource("VISUAL_OBSERVATION"), false);
    assert.equal(isHumanAuthoritativeSource(undefined), false);
  });
});

describe("R4.1 — F-3 search interpreted-state validation", () => {
  it("invalid model category is omitted, not coerced to 'other'", () => {
    assert.equal(resolveSearchCategory("hallucinated_category", undefined), undefined);
    assert.equal(resolveSearchCategory("nonsense", "vehicles"), "vehicles");
  });

  it("valid model category (alias) is kept", () => {
    assert.equal(resolveSearchCategory("automobiliai", undefined), "vehicles");
    assert.equal(resolveSearchCategory("vehicles", undefined), "vehicles");
  });

  it("explicit user-derived category wins over a hallucinated model category", () => {
    assert.equal(resolveSearchCategory("wat", "real_estate"), "real_estate");
  });

  it("minPrice > maxPrice same-source fails safe (not silently swapped)", () => {
    const r = resolveSearchPrice({ modelMin: 600, modelMax: 500 });
    assert.equal(r.minPrice, undefined);
    assert.equal(r.maxPrice, undefined);
    assert.equal(r.conflict, true);
  });

  it("mixed-provenance: explicit user max survives, model min dropped", () => {
    const r = resolveSearchPrice({ modelMin: 900, userMax: 600 });
    assert.equal(r.maxPrice, 600);
    assert.equal(r.minPrice, undefined);
    assert.equal(r.conflict, false);
  });

  it("mixed-provenance: explicit user min survives, model max dropped", () => {
    const r = resolveSearchPrice({ userMin: 900, modelMax: 600 });
    assert.equal(r.minPrice, 900);
    assert.equal(r.maxPrice, undefined);
    assert.equal(r.conflict, false);
  });

  it("valid model-only ordinary range still works", () => {
    const r = resolveSearchPrice({ modelMin: 200, modelMax: 900 });
    assert.equal(r.minPrice, 200);
    assert.equal(r.maxPrice, 900);
    assert.equal(r.conflict, false);
  });

  it("NaN / negative price bounds are dropped", () => {
    const nan = resolveSearchPrice({ modelMax: Number.NaN });
    assert.equal(nan.maxPrice, undefined);
    assert.equal(nan.minPrice, undefined);
    const neg = resolveSearchPrice({ modelMin: -5 });
    assert.equal(neg.minPrice, undefined);
    assert.equal(neg.maxPrice, undefined);
  });

  it("explicit user price survives a model disagreement (user bound kept)", () => {
    const r = resolveSearchPrice({ modelMax: 900, userMax: 600 });
    assert.equal(r.maxPrice, 600);
  });

  it("user max price survives when model omits it", () => {
    const r = resolveSearchPrice({ userMax: 600 });
    assert.equal(r.maxPrice, 600);
  });

  it("explicit current-user city outranks a model-only (stale) city", () => {
    assert.equal(resolveSearchCity("Vilnius", "Kaunas"), "Kaunas");
    assert.equal(resolveSearchCity("Vilnius", undefined), "Vilnius");
    assert.equal(resolveSearchCity(undefined, ""), "");
  });
});

describe("R4.1 — M3 Lithuanian morphology (no ASCII \\b failure)", () => {
  const realEstateNouns = [
    "butas",
    "butą",
    "buto",
    "butui",
    "namas",
    "namą",
    "namo",
    "sklypą",
  ];
  for (const noun of realEstateNouns) {
    it(`"parduodu ${noun}" resolves to real_estate (not other)`, () => {
      const r = buildSellClarificationReply(`Parduodu ${noun}`, {
        userCity: "Vilnius",
        contact: "+37060000000",
      });
      assert.equal(
        r.action.listingDraft.category,
        "real_estate",
        `noun ${noun} must resolve to real_estate`
      );
    });
  }

  it("does NOT misclassify a bottle („butelį“) as real estate", () => {
    const r = buildSellClarificationReply("Parduodu butelį", {
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.notEqual(r.action.listingDraft.category, "real_estate");
  });

  it("no SELL→SEARCH regression: sell intent still wins for butą/namą", () => {
    assert.equal(detectServerSellIntent("Parduodu butą"), true);
    assert.equal(detectServerSellIntent("Parduodu namą"), true);
  });
});

describe("R4.1 — M4 create-family fallback", () => {
  const createPhrases = [
    "sukurk skelbimą",
    "padaryk skelbimą",
    "įkelk šitą",
    "įmesk skelbimą",
    "noriu įdėti skelbimą",
    "noriu parduoti",
  ];
  for (const phrase of createPhrases) {
    it(`"${phrase}" is a sell/create intent (deterministic fallback)`, () => {
      assert.equal(
        detectServerSellIntent(phrase),
        true,
        `phrase must be recognized as sell/create`
      );
    });
  }

  it("'paskelbk' remains PUBLISH intent, not create (publication boundary untouched)", () => {
    // publish intent is handled by the publish path, never folded into create.
    assert.equal(detectServerSellIntent("paskelbk šitą"), false);
  });

  it("create intent does NOT imply unauthorized publication", () => {
    // Sparse create is a clarification skeleton, never an auto-publish.
    const r = buildSellClarificationReply("sukurk skelbimą", {
      userCity: "Vilnius",
      contact: "+37060000000",
    });
    assert.equal(r.action.type, "listing_draft");
    assert.equal(r.action.listingDraft.description, "");
    assert.equal(r.action.listingDraft.price, 0);
  });

  it("'padaryk nuotrauką' is NOT a sell/create intent", () => {
    assert.equal(detectServerSellIntent("padaryk nuotrauką"), false);
  });
});
