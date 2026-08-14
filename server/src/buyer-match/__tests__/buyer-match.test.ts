/**
 * Buyer Match 1.0 — golden dataset (200+) + invariants.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUYER_MATCH_VERSION,
  MATCH_WEIGHTS,
  REASON_CODE_SET,
  TRADEOFF_CODE_SET,
  assertNoDiscriminatoryPreferenceKeys,
  criticalListingHash,
  explainBuyerMatch,
  explanationMatchGuard,
  isAllowedReasonCode,
  isAllowedTradeoffCode,
  parseBuyerMatchResponse,
  runBuyerMatch,
  type BuyerMatchRequest,
  type MatchListingRecord,
} from "../index.js";

const NOW = "2026-08-09T12:00:00.000Z";

function listing(
  id: string,
  patch: Partial<MatchListingRecord> = {}
): MatchListingRecord {
  const base: MatchListingRecord = {
    id,
    title: `Listing ${id}`,
    price: 15000,
    location: "Vilnius",
    category: "vehicles",
    brand: "BMW",
    model: "320",
    year: 2021,
    mileage: 80000,
    condition: "used",
    fuel: "petrol",
    transmission: "automatic",
    color: "black",
    delivery: ["omniva"],
    distanceKm: 25,
    sellerVerified: true,
    vautoScore: 78,
    sponsored: false,
    createdAt: NOW,
  };
  const merged = { ...base, ...patch };
  merged.priceSnapshot = merged.priceSnapshot ?? merged.price;
  merged.criticalHash = merged.criticalHash ?? criticalListingHash(merged);
  return merged;
}

function autoReq(
  ids: string[],
  patch?: Partial<BuyerMatchRequest>
): BuyerMatchRequest {
  return {
    searchQuery: {
      category: "vehicles",
      brand: "BMW",
      priceMax: 18000,
      yearMin: 2020,
      radiusKm: 100,
    },
    preferences: {
      preferredModels: ["320"],
      preferredColors: ["black"],
      preferDelivery: true,
      budgetComfortRatio: 0.9,
    },
    candidateListingIds: ids,
    ...patch,
  };
}

function assertInvariants(res: ReturnType<typeof runBuyerMatch>) {
  parseBuyerMatchResponse(res);
  assert.equal(res.version, BUYER_MATCH_VERSION);
  for (const row of res.rankedListings) {
    assert.equal(row.eligible, true);
    assert.ok(row.matchScore != null);
    assert.ok(row.matchScore! >= 0 && row.matchScore! <= 100);
    assert.ok(row.confidence >= 0 && row.confidence <= 1);
    for (const c of row.reasons) assert.ok(REASON_CODE_SET.has(c));
    for (const c of row.tradeoffs) assert.ok(TRADEOFF_CODE_SET.has(c));
  }
  for (const row of res.ineligibleListings) {
    assert.equal(row.eligible, false);
    assert.equal(row.matchScore, null);
  }
  assert.equal(res.eligibleCount, res.rankedListings.length);
  // No ineligible in primary ranking
  assert.ok(res.rankedListings.every((r) => r.eligible));
}

describe("Buyer Match unit", () => {
  it("weights sum to 1", () => {
    const s = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9);
  });

  it("rejects discriminatory preference keys", () => {
    assert.throws(() =>
      assertNoDiscriminatoryPreferenceKeys({ gender: "x" })
    );
  });
});

describe("Buyer Match automotive (60)", () => {
  for (let i = 0; i < 60; i++) {
    it(`auto ${i + 1}`, () => {
      const id = `auto-${i}`;
      const price = 12000 + (i % 50) * 100;
      const year = 2020 + (i % 4);
      const L = listing(id, {
        price,
        year,
        mileage: 40000 + i * 500,
        distanceKm: 10 + (i % 40),
        vautoScore: 60 + (i % 35),
        model: i % 7 === 0 ? "330" : "320",
      });
      const res = runBuyerMatch({
        request: autoReq([id], {
          preferences: {
            preferredModels: ["320"],
            preferredColors: ["black"],
            preferDelivery: true,
          },
        }),
        listings: [L],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      if (price <= 18000 && year >= 2020) {
        assert.equal(res.eligibleCount, 1);
        assert.ok(res.rankedListings[0].reasons.every(isAllowedReasonCode));
      }
    });
  }
});

describe("Buyer Match electronics (40)", () => {
  for (let i = 0; i < 40; i++) {
    it(`electronics ${i + 1}`, () => {
      const id = `el-${i}`;
      const L = listing(id, {
        category: "electronics",
        brand: "Apple",
        model: "iPhone 14",
        title: "Apple iPhone 14",
        price: 400 + i * 10,
        year: null,
        mileage: null,
        distanceKm: 15,
        color: i % 2 === 0 ? "blue" : null,
        fuel: null,
        transmission: null,
        vautoScore: 70,
      });
      const res = runBuyerMatch({
        request: {
          searchQuery: {
            category: "electronics",
            brand: "Apple",
            priceMax: 900,
            radiusKm: 100,
          },
          preferences: {
            preferredModels: ["iPhone 14"],
            preferredColors: ["blue"],
          },
          candidateListingIds: [id],
        },
        listings: [L],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.equal(res.eligibleCount, 1);
      // Missing color/mileage must not force ineligibility
      if (L.color == null) {
        assert.ok(
          res.rankedListings[0].tradeoffs.includes("MISSING_COLOR_SIGNAL") ||
            res.rankedListings[0].matchScore != null
        );
      }
    });
  }
});

describe("Buyer Match generic (30)", () => {
  for (let i = 0; i < 30; i++) {
    it(`generic ${i + 1}`, () => {
      const id = `gen-${i}`;
      const L = listing(id, {
        category: "home",
        brand: "IKEA",
        model: `Sofa-${i}`,
        title: `IKEA Sofa ${i}`,
        price: 50 + i * 5,
        year: null,
        mileage: null,
        bodyType: null,
        fuel: null,
        transmission: null,
        distanceKm: 5 + i,
        vautoScore: null,
        sellerVerified: i % 2 === 0,
      });
      const res = runBuyerMatch({
        request: {
          searchQuery: { category: "home", priceMax: 400, radiusKm: 80 },
          preferences: { preferDelivery: true },
          candidateListingIds: [id],
        },
        listings: [L],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.equal(res.eligibleCount, 1);
    });
  }
});

describe("Buyer Match hard-constraint (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`hard ${i + 1}`, () => {
      const good = listing(`h-good-${i}`, { price: 15000, year: 2021, distanceKm: 40 });
      const overBudget = listing(`h-over-${i}`, {
        price: 19000 + i,
        year: 2021,
        distanceKm: 40,
      });
      const oldYear = listing(`h-old-${i}`, { price: 15000, year: 2018, distanceKm: 40 });
      const far = listing(`h-far-${i}`, { price: 15000, year: 2021, distanceKm: 150 });
      const ids = [good.id, overBudget.id, oldYear.id, far.id];
      const res = runBuyerMatch({
        request: autoReq(ids),
        listings: [good, overBudget, oldYear, far],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.equal(res.eligibleCount, 1);
      assert.equal(res.rankedListings[0].listingId, good.id);
      assert.ok(res.ineligibleListings.some((x) => x.listingId === overBudget.id));
      assert.ok(res.rankedListings.every((r) => r.eligible));
      assert.ok(!res.rankedListings.some((r) => r.listingId === overBudget.id));
    });
  }
});

describe("Buyer Match missing-data (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`missing ${i + 1}`, () => {
      const withMile = listing(`m-full-${i}`, { mileage: 60000, color: "black" });
      const noMile = listing(`m-miss-${i}`, {
        mileage: null,
        color: null,
        price: withMile.price,
        year: withMile.year,
        distanceKm: withMile.distanceKm,
        vautoScore: withMile.vautoScore,
      });
      const res = runBuyerMatch({
        request: autoReq([withMile.id, noMile.id]),
        listings: [withMile, noMile],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.equal(res.eligibleCount, 2);
      const miss = res.rankedListings.find((r) => r.listingId === noMile.id)!;
      assert.ok(miss.matchScore != null);
      // Missing mileage is tradeoff / lower confidence — not automatic rejection
      assert.ok(miss.tradeoffs.includes("MISSING_MILEAGE_SIGNAL") || miss.confidence < 1);
    });
  }
});

describe("Buyer Match conflicting preferences (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`conflict ${i + 1}`, () => {
      const a = listing(`c-a-${i}`, {
        model: "320",
        color: "black",
        price: 14000,
        mileage: 50000,
      });
      const b = listing(`c-b-${i}`, {
        model: "330",
        color: "white",
        price: 16000,
        mileage: 90000,
      });
      const res = runBuyerMatch({
        request: autoReq([a.id, b.id], {
          preferences: {
            preferredModels: ["320"],
            preferredColors: ["black"],
            preferredMileageMax: 70000,
          },
        }),
        listings: [a, b],
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.ok(res.eligibleCount >= 1);
      // Prefer model/color aligned listing at top when both eligible
      if (res.eligibleCount === 2) {
        assert.equal(res.rankedListings[0].listingId, a.id);
      }
    });
  }
});

describe("Buyer Match diversification (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`diversity ${i + 1}`, () => {
      const items = Array.from({ length: 5 }, (_, j) =>
        listing(`d-${i}-${j}`, {
          price: 15000,
          year: 2021,
          mileage: 70000 + j,
          distanceKm: 20 + j,
          model: "320",
        })
      );
      const res = runBuyerMatch({
        request: autoReq(items.map((x) => x.id)),
        listings: items,
        calculatedAt: NOW,
      });
      assertInvariants(res);
      assert.equal(res.eligibleCount, 5);
      // Stable unique ordering
      const ids = res.rankedListings.map((r) => r.listingId);
      assert.equal(new Set(ids).size, 5);
      // Re-run identical
      const res2 = runBuyerMatch({
        request: autoReq(items.map((x) => x.id)),
        listings: items,
        calculatedAt: NOW,
      });
      assert.deepEqual(
        res2.rankedListings.map((r) => r.listingId),
        ids
      );
    });
  }
});

describe("Buyer Match adversarial / manipulation / revalidation (10)", () => {
  it("sponsored flag does not change organic matchScore", () => {
    const base = listing("sp-1", { sponsored: false, promoted: false });
    const promo = listing("sp-1", { sponsored: true, promoted: true });
    const r1 = runBuyerMatch({
      request: autoReq(["sp-1"]),
      listings: [base],
      calculatedAt: NOW,
    });
    const r2 = runBuyerMatch({
      request: autoReq(["sp-1"]),
      listings: [promo],
      calculatedAt: NOW,
    });
    assert.equal(r1.rankedListings[0].matchScore, r2.rankedListings[0].matchScore);
  });

  it("hallucinated id not in catalog stays ineligible, never ranked", () => {
    const L = listing("real-1");
    const res = runBuyerMatch({
      request: autoReq(["real-1", "hallucinated-ghost-99"]),
      listings: [L],
      calculatedAt: NOW,
    });
    assertInvariants(res);
    assert.ok(!res.rankedListings.some((r) => r.listingId === "hallucinated-ghost-99"));
    assert.ok(
      res.ineligibleListings.some((r) => r.listingId === "hallucinated-ghost-99")
    );
  });

  it("listing outside candidate set is never ranked", () => {
    const a = listing("in-set");
    const b = listing("out-set", { price: 10000, year: 2022, distanceKm: 5 });
    const res = runBuyerMatch({
      request: autoReq(["in-set"]),
      listings: [a, b],
      calculatedAt: NOW,
    });
    assert.ok(!res.rankedListings.some((r) => r.listingId === "out-set"));
    assert.equal(res.totalCandidatesEvaluated, 1);
  });

  it("price revalidation fails when snapshot drifts", () => {
    const L = listing("rev-1", { price: 15000, priceSnapshot: 14000 });
    const res = runBuyerMatch({
      request: autoReq(["rev-1"]),
      listings: [L],
      calculatedAt: NOW,
    });
    assert.equal(res.eligibleCount, 0);
    assert.ok(res.ineligibleListings.some((r) => r.listingId === "rev-1"));
  });

  it("critical hash revalidation fails on year change", () => {
    const L = listing("rev-2", { year: 2021 });
    L.criticalHash = criticalListingHash({ ...L, year: 2020 });
    const res = runBuyerMatch({
      request: autoReq(["rev-2"]),
      listings: [L],
      calculatedAt: NOW,
    });
    assert.equal(res.eligibleCount, 0);
  });

  it("explanation guard rejects invented score", async () => {
    const L = listing("ex-1");
    const res = runBuyerMatch({
      request: autoReq(["ex-1"]),
      listings: [L],
      calculatedAt: NOW,
    });
    const g = explanationMatchGuard(res, "Geriausias matchScore yra 99");
    if (res.rankedListings[0]?.matchScore !== 99) {
      assert.equal(g.ok, false);
    }
  });

  it("explanation guard rejects reorder", async () => {
    const a = listing("ord-a", { price: 12000, mileage: 40000, distanceKm: 10 });
    const b = listing("ord-b", { price: 17000, mileage: 120000, distanceKm: 80 });
    const res = runBuyerMatch({
      request: autoReq([a.id, b.id]),
      listings: [a, b],
      calculatedAt: NOW,
    });
    assert.ok(res.eligibleCount === 2);
    const top = res.rankedListings[0].listingId;
    const second = res.rankedListings[1].listingId;
    const g = explanationMatchGuard(
      res,
      `Pirma ${second}, tada ${top}`
    );
    assert.equal(g.ok, false);
  });

  it("LLM explanation reject path returns template", async () => {
    const L = listing("ex-2");
    const res = runBuyerMatch({
      request: autoReq(["ex-2"]),
      listings: [L],
      calculatedAt: NOW,
    });
    const out = await explainBuyerMatch(res, async () => "Inventuotas balas 77/100");
    assert.equal(out.rejected, true);
    assert.equal(out.source, "template");
  });

  it("allowlist helpers", () => {
    assert.ok(isAllowedReasonCode("WITHIN_BUDGET"));
    assert.ok(isAllowedTradeoffCode("PRICE_NEAR_BUDGET_LIMIT"));
    assert.ok(!isAllowedReasonCode("FAKE_CODE"));
  });

  it("over-budget never appears in primary ranking even if high vautoScore", () => {
    const cheap = listing("ok-x", { price: 15000, vautoScore: 50 });
    const expensive = listing("bad-x", { price: 25000, vautoScore: 99, year: 2022 });
    const res = runBuyerMatch({
      request: autoReq([cheap.id, expensive.id]),
      listings: [cheap, expensive],
      calculatedAt: NOW,
    });
    assert.ok(!res.rankedListings.some((r) => r.listingId === expensive.id));
  });
});

describe("Buyer Match performance p50/p95", () => {
  it("batch latency", () => {
    const listings = Array.from({ length: 40 }, (_, i) =>
      listing(`perf-${i}`, {
        price: 13000 + i * 50,
        year: 2020 + (i % 3),
        distanceKm: 5 + i,
      })
    );
    const ids = listings.map((l) => l.id);
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      runBuyerMatch({
        request: autoReq(ids),
        listings,
        calculatedAt: NOW,
      });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    assert.ok(p50 < 50, `p50 ${p50}`);
    assert.ok(p95 < 120, `p95 ${p95}`);
  });
});
