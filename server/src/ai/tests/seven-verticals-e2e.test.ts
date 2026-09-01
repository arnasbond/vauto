/**
 * F4 — 7-vertical end-to-end integration certification & hardening.
 *
 * The FULL deterministic chain per vertical:
 *   F3 search parsing → F2 sell drafting (fact-evidence + conflicts) →
 *   canonical intel projection → F1 context protection (model-visible slice) →
 *   Deal Room capability handoff (fail-closed per category).
 *
 * Plus cross-vertical transition safety, number-notation and mixed-language
 * hardening, and AI-failure resilience (no model → no breakage of the
 * deterministic chain, Deal Room review or manual listing).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseUniversalSearchQuery } from "../search/universal-search-query.js";
import { buildSellDraft } from "../sell/visual-sell-engine.js";
import { parseSellDraft } from "../sell/sell-draft-schema.js";
import { sellDraftToIntelDraft } from "../sell/sell-to-intel.js";
import { slimListingDraftForLlm } from "../../shared/llm-context-slice.js";
import { getCategoryCapabilities } from "../../shared/marketplace-domain/queries.js";
import { FAIL_CLOSED_CAPABILITIES } from "../../shared/marketplace-domain/capabilities.js";

interface VerticalCase {
  vertical: string;
  searchQuery: string;
  expectedCategory: string;
  sellText: string;
  sellVision?: { visualBrand?: string; visualModel?: string; visualCategory?: string };
  dealRoomCategoryId: string;
  dealRoomExpects: {
    offers: boolean;
    negotiation: boolean;
    platformPayment: boolean;
    applications: boolean;
  };
}

const VERTICALS: VerticalCase[] = [
  {
    vertical: "transportas",
    searchQuery: "BMW 320d 2015 m. dyzelis iki 9000 € Vilniuje",
    expectedCategory: "vehicles",
    sellText: "Parduodu BMW 320d, 2015 m., dyzelis, rida 120000",
    sellVision: { visualBrand: "Audi" },
    dealRoomCategoryId: "vehicles",
    dealRoomExpects: { offers: true, negotiation: true, platformPayment: true, applications: false },
  },
  {
    vertical: "nekilnojamas turtas",
    searchQuery: "butas 3 kambarių 65 kv.m Kaune iki 120000 eur",
    expectedCategory: "real_estate",
    sellText: "Parduodu 3 kambarių butą, 65 kv.m, Kaunas",
    dealRoomCategoryId: "real_estate",
    dealRoomExpects: { offers: true, negotiation: true, platformPayment: false, applications: false },
  },
  {
    vertical: "elektronika",
    searchQuery: "iphone 256gb naudotas iki 400 €",
    expectedCategory: "electronics",
    sellText: "Parduodu iPhone 13, 256 GB, naudotas, būklė gera",
    dealRoomCategoryId: "electronics",
    dealRoomExpects: { offers: true, negotiation: true, platformPayment: true, applications: false },
  },
  {
    vertical: "drabužiai",
    searchQuery: "batus 42 dydis Vilniuje",
    expectedCategory: "clothing",
    sellText: "Parduodu Nike kedus, 42 dydžio, būklė gera",
    dealRoomCategoryId: "clothing",
    dealRoomExpects: { offers: false, negotiation: false, platformPayment: false, applications: false },
  },
  {
    vertical: "bendros prekės",
    searchQuery: "ieškau sofos kampinės iki 300 eur",
    expectedCategory: "home",
    sellText: "Parduodu sofą kampinę, pilka, būklė puiki",
    dealRoomCategoryId: "home",
    dealRoomExpects: { offers: true, negotiation: true, platformPayment: true, applications: false },
  },
  {
    vertical: "paslaugos",
    searchQuery: "santechniko paslaugos Kaune iki 50 €",
    expectedCategory: "services",
    sellText: "Teikiu santechnikos paslaugas Kaune, valanda 30 €",
    dealRoomCategoryId: "services",
    dealRoomExpects: { offers: true, negotiation: true, platformPayment: true, applications: false },
  },
  {
    vertical: "darbai",
    searchQuery: "darbo vairuotoju Vilniuje atlygis 2000",
    expectedCategory: "jobs",
    sellText: "Ieškau darbo vairuotoju Vilniuje, atlygis 2000 €",
    dealRoomCategoryId: "jobs",
    dealRoomExpects: { offers: false, negotiation: false, platformPayment: false, applications: true },
  },
];

describe("F4 — full deterministic chain per vertical (search → draft → intel → deal room)", () => {
  for (const v of VERTICALS) {
    it(`${v.vertical}: F3 → F2 → F1 → Deal Room handoff`, async () => {
      process.env.AI_MODEL_VISION = "foundation-vision-alias";
      process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";

      // F3 — search decomposition resolves the right vertical.
      const search = parseUniversalSearchQuery(v.searchQuery);
      assert.equal(search.canonicalCategory, v.expectedCategory, "F3 category");

      // F2 — deterministic draft (no model required for text-only; vision
      // supplied where a conflict must be exercised).
      const draft = await buildSellDraft({
        input: {
          text: v.sellText,
          ...(v.sellVision ? { imageUrls: ["https://cdn.example.com/x.jpg"] } : {}),
        },
        ...(v.sellVision
          ? {
              visionExtractor: async () => ({ ...v.sellVision, confidence: 0.8 }),
              imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
            }
          : {}),
      });
      assert.equal(draft.requiresUserConfirmation, true, "HITL gate");
      assert.equal(draft.autoPublish, false, "no auto publish");
      // Schema-validated structured evidence survives.
      const reparsed = parseSellDraft(
        JSON.parse(JSON.stringify(draft)) as Record<string, unknown>
      );

      // Conflict exercised for transport (text brand vs vision brand).
      if (v.vertical === "transportas") {
        assert.ok(reparsed.factEvidence?.brand?.conflictWith, "conflict persists");
      }

      // Canonical intel projection keeps review/conflict signals.
      const intel = sellDraftToIntelDraft(reparsed);
      assert.equal(intel.requiresReview, true, "intel review signal");
      if (v.vertical === "transportas") {
        assert.ok(intel.fields.brand!.conflicts.length >= 1, "intel conflict");
        assert.equal(intel.fields.brand!.reviewState, "NEEDS_REVIEW");
      }

      // F1 — context protection: no structured evidence in the model slice.
      const slim = slimListingDraftForLlm(draft as unknown as Record<string, unknown>);
      const slimJson = JSON.stringify(slim);
      assert.ok(!slimJson.includes("factEvidence"), "no evidence in model slice");
      assert.ok(!slimJson.includes("TRUSTED_VERIFICATION"));

      // Deal Room handoff — capability gate per vertical (fail-closed rules).
      const caps = getCategoryCapabilities(v.dealRoomCategoryId);
      assert.equal(caps.supportsOffers, v.dealRoomExpects.offers);
      assert.equal(caps.supportsNegotiation, v.dealRoomExpects.negotiation);
      assert.equal(caps.supportsPlatformPayment, v.dealRoomExpects.platformPayment);
      assert.equal(caps.supportsApplications, v.dealRoomExpects.applications);
    });
  }

  it("clothing and unknown categories fail closed (no privileged capabilities)", () => {
    const clothing = getCategoryCapabilities("clothing");
    assert.equal(clothing.supportsOffers, false);
    assert.equal(clothing.supportsPlatformPayment, false);
    assert.deepEqual(getCategoryCapabilities("hacker-category"), FAIL_CLOSED_CAPABILITIES);
  });
});

describe("F4 — cross-vertical transition safety (no context leakage)", () => {
  it("parsing transport then clothing never leaks vehicle attributes", () => {
    const transport = parseUniversalSearchQuery("BMW 2015 m. dyzelis iki 9000 €");
    assert.equal(transport.canonicalCategory, "vehicles");
    assert.equal(transport.verticalAttributes.year, 2015);

    const clothing = parseUniversalSearchQuery("suknelė 42 dydis");
    assert.equal(clothing.canonicalCategory, "clothing");
    assert.deepEqual(clothing.verticalAttributes, { size: "42" });
    assert.ok(!("year" in clothing.verticalAttributes));
    assert.ok(!("fuel" in clothing.verticalAttributes));
    assert.ok(!clothing.freeTextKeywords.includes("dyzelis"));
  });

  it("a jobs query never inherits a prior transport parse state", () => {
    parseUniversalSearchQuery("BMW 320d iki 5000 €");
    const jobs = parseUniversalSearchQuery("darbo siuvėja atlygis 1500");
    assert.equal(jobs.canonicalCategory, "jobs");
    assert.ok(!("year" in jobs.verticalAttributes));
    assert.equal(jobs.verticalAttributes.salary, 1500);
  });
});

describe("F4 — number formats and mixed language hardening", () => {
  it("'150k' with a price cue becomes 150000", () => {
    const q = parseUniversalSearchQuery("telefonas iki 150k");
    assert.equal(q.priceMax, 150000);
  });

  it("'150.000€' becomes 150000", () => {
    const q = parseUniversalSearchQuery("automobilis iki 150.000€");
    assert.equal(q.priceMax, 150000);
  });

  it("'nuo 100k' becomes 100000", () => {
    const q = parseUniversalSearchQuery("butas nuo 100k eur");
    assert.equal(q.priceMin, 100000);
  });

  it("'under 300 eur' and 'below 250' resolve as max price", () => {
    assert.equal(parseUniversalSearchQuery("sofa under 300 eur").priceMax, 300);
    assert.equal(parseUniversalSearchQuery("dviračio below 250").priceMax, 250);
  });

  it("bare '150k' without a price cue stays a keyword (mileage ambiguity)", () => {
    const q = parseUniversalSearchQuery("BMW rida 150k");
    assert.equal(q.priceMax, undefined);
    assert.ok(q.freeTextKeywords.includes("150k"), "ambiguous 150k stays a token");
  });

  it("mixed LT/EN: 'looking for sofa under 300 eur Vilnius'", () => {
    const q = parseUniversalSearchQuery("looking for sofa under 300 eur Vilnius");
    assert.equal(q.canonicalCategory, "home");
    assert.equal(q.priceMax, 300);
    assert.equal(q.location, "Vilnius");
    assert.ok(q.freeTextKeywords.includes("sofa"));
  });

  it("ambiguous terms stay deterministic across verticals", () => {
    // "konsolė" is electronics/gaming — never jobs or services.
    const q = parseUniversalSearchQuery("konsolė ps5 iki 400 €");
    assert.ok(["electronics", "home"].includes(q.canonicalCategory));
    assert.notEqual(q.canonicalCategory, "jobs");
    assert.notEqual(q.canonicalCategory, "services");
  });
});

describe("F4 — AI-failure resilience (deterministic chain never breaks)", () => {
  it("draft building without ANY model (no vision extractor) still yields a valid HITL draft", async () => {
    const draft = await buildSellDraft({
      input: { text: "Parduodu dviratį už 200 €" },
      // no visionExtractor — the deterministic path must not break
    });
    assert.equal(draft.requiresUserConfirmation, true);
    assert.equal(draft.autoPublish, false);
    const reparsed = parseSellDraft(
      JSON.parse(JSON.stringify(draft)) as Record<string, unknown>
    );
    const intel = sellDraftToIntelDraft(reparsed);
    assert.ok(intel.fields.title, "manual listing fields still usable");
  });

  it("legacy manual drafts without any evidence metadata stay fully usable", () => {
    const legacy = parseSellDraft({
      category: { value: "vehicles", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
      title: { value: "BMW e46", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F4",
    });
    assert.equal(legacy.factEvidence, undefined);
    const intel = sellDraftToIntelDraft(legacy);
    assert.equal(intel.fields.title?.value, "BMW e46");
  });

  it("Deal Room capability resolution never throws for garbage categories", () => {
    for (const cat of ["unknown", 42, null, {}, "vehicles", "jobs"]) {
      const caps = getCategoryCapabilities(cat);
      assert.ok(typeof caps.supportsOffers === "boolean");
    }
  });
});
