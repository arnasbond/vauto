/**
 * F5 — 7-vertical product parity regression matrix (real production adapters).
 *
 * One parametrized matrix proving the SAME product path for every marketplace
 * category through the REAL adapters — no mocks, no parallel registry:
 *
 *   F3 search intent → canonical vertical mapping (legacy aliases) →
 *   canonical filters → F2 deterministic draft → single-question policy →
 *   server pre-publish HITL gate → presentation contract (card/detail) →
 *   Deal Room capabilities → AI-down manual fallback → cross-vertical
 *   transitions without leakage.
 *
 * CLOTHING/FASHION is NOT a canonical 13A root vertical: the compatibility
 * path keeps it working end-to-end (search + draft + manual listing) while
 * vertical-level features (filters/capabilities/presentation) fail closed to
 * the universal defaults — this is the certified product-parity contract.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackTokenizedSearchQuery,
  parseUniversalSearchQuery,
} from "../search/universal-search-query.js";
import { buildSellDraft } from "../sell/visual-sell-engine.js";
import { parseSellDraft } from "../sell/sell-draft-schema.js";
import { buildSellerContextualVoiceFollowUp } from "../seller-voice-prompt.js";
import { evaluateServerPrePublishReadiness } from "../pre-publish-validation.js";
import { resolveVerticalId } from "../../shared/marketplace-domain/legacy.js";
import {
  getCategoryCapabilities,
  getFilterableAttributes,
} from "../../shared/marketplace-domain/queries.js";
import { FAIL_CLOSED_CAPABILITIES } from "../../shared/marketplace-domain/capabilities.js";
import { VERTICAL_ATTRIBUTES } from "../../shared/marketplace-domain/attributes.js";
import type { VerticalId } from "../../shared/marketplace-domain/types.js";

interface ParityCase {
  vertical: string;
  searchQuery: string;
  expectedCategory: string;
  verticalId: VerticalId | null;
  sellText: string;
  dealRoom: {
    offers: boolean;
    platformPayment: boolean;
    applications: boolean;
    shipping: boolean;
  };
}

const VERTICALS: ParityCase[] = [
  {
    vertical: "TRANSPORT / vehicles",
    searchQuery: "BMW 320d 2015 m. dyzelis iki 9000 € Vilniuje",
    expectedCategory: "vehicles",
    verticalId: "TRANSPORT",
    sellText: "Parduodu BMW 320d, 2015 m., dyzelis, rida 120000",
    dealRoom: { offers: true, platformPayment: true, applications: false, shipping: false },
  },
  {
    vertical: "REAL_ESTATE / real_estate",
    searchQuery: "butas 3 kambarių 65 kv.m Kaune iki 120000 eur",
    expectedCategory: "real_estate",
    verticalId: "REAL_ESTATE",
    sellText: "Parduodu 3 kambarių butą, 65 kv.m, Kaunas",
    dealRoom: { offers: true, platformPayment: false, applications: false, shipping: false },
  },
  {
    vertical: "ELECTRONICS / electronics",
    searchQuery: "iphone 256gb naudotas iki 400 €",
    expectedCategory: "electronics",
    verticalId: "ELECTRONICS",
    sellText: "Parduodu iPhone 13, 256 GB, naudotas",
    dealRoom: { offers: true, platformPayment: true, applications: false, shipping: true },
  },
  {
    vertical: "CLOTHING / clothing (legacy, non-canonical root)",
    searchQuery: "batus 42 dydis Vilniuje",
    expectedCategory: "clothing",
    verticalId: null,
    sellText: "Parduodu Nike kedus, 42 dydžio, būklė gera",
    dealRoom: { offers: false, platformPayment: false, applications: false, shipping: false },
  },
  {
    vertical: "HOME_GARDEN / home",
    searchQuery: "ieškau sofos kampinės iki 300 eur",
    expectedCategory: "home",
    verticalId: "HOME_GARDEN",
    sellText: "Parduodu sofą kampinę, pilka, būklė puiki",
    dealRoom: { offers: true, platformPayment: true, applications: false, shipping: true },
  },
  {
    vertical: "SERVICES / services",
    searchQuery: "santechniko paslaugos Kaune iki 50 €",
    expectedCategory: "services",
    verticalId: "SERVICES",
    sellText: "Teikiu santechnikos paslaugas Kaune, valanda 30 €",
    dealRoom: { offers: true, platformPayment: true, applications: false, shipping: false },
  },
  {
    vertical: "JOBS / jobs",
    searchQuery: "darbo vairuotoju Vilniuje atlygis 2000",
    expectedCategory: "jobs",
    verticalId: "JOBS",
    sellText: "Ieškau darbo vairuotoju Vilniuje, atlygis 2000 €",
    dealRoom: { offers: false, platformPayment: false, applications: true, shipping: false },
  },
];

const VERTICAL_ONLY_ATTRS: Partial<Record<VerticalId, string[]>> = {
  TRANSPORT: ["vin", "engineLiters", "fuelType", "transmission", "mileage"],
};

describe("F5 — 7-vertical product parity matrix (real adapters)", () => {
  for (const v of VERTICALS) {
    it(`${v.vertical}: full deterministic product path`, async () => {
      // 1. Search intent → correct category.
      const search = parseUniversalSearchQuery(v.searchQuery);
      assert.equal(search.canonicalCategory, v.expectedCategory, "F3 category");

      // 2. Canonical vertical mapping (legacy aliases, fail-closed).
      const verticalId = resolveVerticalId(v.expectedCategory);
      assert.equal(verticalId, v.verticalId, "canonical vertical id");

      // 3. Filters — canonical registry, never a foreign taxonomy.
      if (v.verticalId) {
        const filters = getFilterableAttributes(v.expectedCategory);
        assert.ok(filters.length > 0, "canonical vertical exposes filterable attrs");
        const knownKeys = new Set(VERTICAL_ATTRIBUTES[v.verticalId].map((a) => a.key));
        for (const f of filters) assert.ok(knownKeys.has(f.key), `filter ${f.key} is canonical`);
      } else {
        assert.deepEqual(
          getFilterableAttributes(v.expectedCategory),
          [],
          "non-canonical vertical fails closed (no filters)"
        );
      }

      // 4. Deterministic draft (no model) — valid HITL draft, no invented facts.
      const draft = await buildSellDraft({ input: { text: v.sellText } });
      assert.equal(draft.requiresUserConfirmation, true);
      assert.equal(draft.autoPublish, false);
      const reparsed = parseSellDraft(
        JSON.parse(JSON.stringify(draft)) as Record<string, unknown>
      );
      assert.ok(reparsed.title.value || reparsed.category.value, "draft has content");

      // 5. No transport attribute leakage into non-transport drafts.
      if (v.verticalId !== "TRANSPORT") {
        for (const key of VERTICAL_ONLY_ATTRS.TRANSPORT ?? []) {
          assert.ok(
            !(key in (reparsed.attributes as Record<string, unknown>)),
            `no transport attr "${key}" in ${v.vertical}`
          );
        }
      }

      // 6. Single highest-value question when info is missing.
      const question = buildSellerContextualVoiceFollowUp(
        v.expectedCategory,
        {},
        ["price"]
      );
      if (question) {
        assert.ok(!question.includes("\n"), "exactly one question, never an interview");
      }

      // 7. Pre-publish HITL gate — identical, vertical-agnostic rules.
      const prepublish = evaluateServerPrePublishReadiness({
        isAuthenticated: true,
        profilePhone: "+37060000000",
        listingDraft: { location: "Vilnius", price: 100 },
      });
      assert.equal(prepublish.missingPhone, false, "phone resolved");
      assert.equal(prepublish.missingCity, false, "city resolved");
      assert.equal(prepublish.missingAuth, false);
      assert.equal(prepublish.missingPhoto, true, "photo gate is universal");

      // 8. Presentation contract data — canonical attributes only (the
      // card/detail rendering contract itself is certified client-side in
      // src/lib/__tests__/f5-presentation-parity.test.ts).
      if (v.verticalId) {
        const canonicalAttrs = VERTICAL_ATTRIBUTES[v.verticalId];
        assert.ok(canonicalAttrs.length > 0, "canonical attribute schema exists");
        const keys = new Set(canonicalAttrs.map((a) => a.key));
        assert.ok(keys.size === canonicalAttrs.length, "no duplicate canonical keys");
      } else {
        // Legacy clothing — no canonical vertical: universal defaults apply.
        assert.equal(resolveVerticalId("clothing"), null);
      }

      // 9. Deal Room capabilities — canonical gate per category.
      const caps = getCategoryCapabilities(v.expectedCategory);
      assert.equal(caps.supportsOffers, v.dealRoom.offers);
      assert.equal(caps.supportsPlatformPayment, v.dealRoom.platformPayment);
      assert.equal(caps.supportsApplications, v.dealRoom.applications);
      assert.equal(caps.supportsShipping, v.dealRoom.shipping);

      // 10. AI-down manual fallback — bounded tokenized search + manual draft.
      const fallback = fallbackTokenizedSearchQuery(v.searchQuery);
      assert.ok(fallback.length > 0 && fallback.length <= 160);
      assert.ok(!fallback.includes("<system"), "no injection in fallback");
    });
  }

  it("cross-vertical transitions never leak attributes or filters", () => {
    const order: Array<[string, string]> = [
      ["BMW 2015 m. dyzelis iki 9000 €", "vehicles"],
      ["suknelė 42 dydis", "clothing"],
      ["butas 3 kambarių 65 kv.m", "real_estate"],
      ["iphone 256gb", "electronics"],
      ["sofos kampinės iki 300 eur", "home"],
      ["santechniko paslaugos", "services"],
      ["darbo vairuotoju atlygis 2000", "jobs"],
    ];
    for (const [query, category] of order) {
      const q = parseUniversalSearchQuery(query);
      assert.equal(q.canonicalCategory, category);
      if (category !== "vehicles") {
        assert.ok(!("year" in q.verticalAttributes));
        assert.ok(!("fuel" in q.verticalAttributes));
      }
      if (category !== "jobs") {
        assert.ok(!("salary" in q.verticalAttributes));
      }
    }
  });
});

describe("F5 — adversarial parity cases", () => {
  it("mixed-category queries resolve deterministically, no silent rewrite", () => {
    // Car accessories are goods, not vehicles.
    assert.equal(
      parseUniversalSearchQuery("ieškau automobilio sėdynių užvalkalų").canonicalCategory,
      "home"
    );
    // Office furniture is not a job search.
    assert.equal(parseUniversalSearchQuery("ieškau darbo kėdės").canonicalCategory, "home");
    assert.equal(
      parseUniversalSearchQuery("ieškau darbo stalo").canonicalCategory,
      "home"
    );
  });

  it("transport-sounding words in non-transport context never force vehicles", () => {
    for (const query of ["skalbimo mašina", "siuvimo mašina", "indų mašina"]) {
      assert.notEqual(parseUniversalSearchQuery(query).canonicalCategory, "vehicles", query);
    }
  });

  it("foreign vertical attributes are rejected, not silently adopted", () => {
    const clothing = parseUniversalSearchQuery("suknelė 2015 m. 256gb 42 dydis");
    assert.equal(clothing.canonicalCategory, "clothing");
    assert.ok(!("year" in clothing.verticalAttributes));
    assert.ok(!("storage" in clothing.verticalAttributes));
  });

  it("unknown categories fail closed everywhere", () => {
    assert.equal(parseUniversalSearchQuery("xyzzy hmm").canonicalCategory, "other");
    assert.equal(resolveVerticalId("hacker"), null);
    assert.deepEqual(getCategoryCapabilities("hacker"), FAIL_CLOSED_CAPABILITIES);
    assert.deepEqual(getFilterableAttributes("hacker"), []);
  });

  it("legacy aliases map canonically; clothing/fashion stay non-canonical", () => {
    assert.equal(resolveVerticalId("vehicles"), "TRANSPORT");
    assert.equal(resolveVerticalId("auto"), "TRANSPORT");
    assert.equal(resolveVerticalId("home"), "HOME_GARDEN");
    assert.equal(resolveVerticalId("baldai"), "HOME_GARDEN");
    assert.equal(resolveVerticalId("clothing"), null);
    assert.equal(resolveVerticalId("fashion"), null);
  });

  it("missing or conflicting information never manufactures facts", async () => {
    const sparse = await buildSellDraft({ input: { text: "parduodu" } });
    assert.equal(sparse.requiresUserConfirmation, true);
    assert.equal(sparse.price?.value ?? null, null, "no invented price");
    assert.equal(sparse.year?.value ?? null, null, "no invented year");
  });

  it("presentation contract data never invents attributes outside the canonical schema", () => {
    for (const id of ["TRANSPORT", "REAL_ESTATE", "ELECTRONICS", "SERVICES", "JOBS", "HOME_GARDEN"] as VerticalId[]) {
      const attrs = VERTICAL_ATTRIBUTES[id];
      const keys = new Set(attrs.map((a) => a.key));
      assert.equal(keys.size, attrs.length, `unique canonical keys for ${id}`);
    }
    // Legacy clothing has no canonical vertical — the universal card path applies.
    assert.equal(resolveVerticalId("clothing"), null);
  });
});
