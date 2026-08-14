/**
 * Compare Engine 1.0 — golden dataset (180+) + invariants.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTOMOTIVE_ATTR_KEYS,
  COMPARE_ENGINE_VERSION,
  COMPARE_TRADEOFF_SET,
  compareListingsSync,
  criticalCompareHash,
  explainCompare,
  explanationCompareGuard,
  isAllowedCompareTradeoff,
  parseCompareResponse,
  type CompareListingRecord,
  type CompareRequest,
  type CompareResponse,
} from "../index.js";

const AT = "2026-08-09T12:00:00.000Z";

function auto(
  id: string,
  patch: Partial<CompareListingRecord> = {}
): CompareListingRecord {
  const base: CompareListingRecord = {
    id,
    title: `Auto ${id}`,
    category: "vehicles",
    price: 15000,
    currency: "EUR",
    brand: "BMW",
    model: "320",
    year: 2021,
    mileage: 80000,
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "rwd",
    condition: "used",
    color: "black",
    distanceKm: 30,
    delivery: ["omniva"],
    vautoScore: 75,
    updatedAt: AT,
    visibility: "public",
    status: "active",
  };
  const merged = { ...base, ...patch };
  merged.priceSnapshot = merged.priceSnapshot ?? merged.price;
  merged.criticalHash = merged.criticalHash ?? criticalCompareHash(merged);
  return merged;
}

function phone(
  id: string,
  patch: Partial<CompareListingRecord> = {}
): CompareListingRecord {
  const base: CompareListingRecord = {
    id,
    title: `Phone ${id}`,
    category: "electronics",
    price: 500,
    brand: "Apple",
    model: "iPhone 14",
    storageGb: 128,
    condition: "used",
    color: "blue",
    batteryHealthPercent: 90,
    batteryHealthVerified: true,
    warrantyMonths: 6,
    delivery: ["omniva"],
    distanceKm: 12,
    vautoScore: 70,
    updatedAt: AT,
    visibility: "public",
    status: "active",
    year: null,
    mileage: null,
  };
  const merged = { ...base, ...patch };
  merged.priceSnapshot = merged.priceSnapshot ?? merged.price;
  merged.criticalHash = merged.criticalHash ?? criticalCompareHash(merged);
  return merged;
}

function home(
  id: string,
  patch: Partial<CompareListingRecord> = {}
): CompareListingRecord {
  const base: CompareListingRecord = {
    id,
    title: `Home ${id}`,
    category: "home",
    price: 120,
    brand: "IKEA",
    model: "Sofa",
    condition: "used",
    delivery: [],
    distanceKm: 8,
    updatedAt: AT,
    visibility: "public",
    status: "active",
  };
  const merged = { ...base, ...patch };
  merged.priceSnapshot = merged.priceSnapshot ?? merged.price;
  merged.criticalHash = merged.criticalHash ?? criticalCompareHash(merged);
  return merged;
}

function assertInvariants(res: CompareResponse, requested: string[]) {
  parseCompareResponse(res);
  assert.equal(res.compareVersion, COMPARE_ENGINE_VERSION);
  if (res.status === "AVAILABLE") {
    assert.ok(res.comparedListings.length >= 2 && res.comparedListings.length <= 4);
    for (const l of res.comparedListings) {
      assert.ok(requested.includes(l.listingId));
    }
    for (const t of res.tradeoffs) {
      assert.ok(requested.includes(t.listingId));
      for (const c of t.pros) assert.ok(COMPARE_TRADEOFF_SET.has(c));
      for (const c of t.cons) assert.ok(COMPARE_TRADEOFF_SET.has(c));
    }
    // Preserve request order
    assert.deepEqual(
      res.comparedListings.map((l) => l.listingId),
      requested.filter((id) => res.comparedListings.some((l) => l.listingId === id))
    );
  }
}

describe("Compare Engine unit", () => {
  it("automotive attr keys non-empty", () => {
    assert.ok(AUTOMOTIVE_ATTR_KEYS.length >= 8);
  });
  it("allowlist helper", () => {
    assert.ok(isAllowedCompareTradeoff("LOWER_PRICE"));
    assert.ok(!isAllowedCompareTradeoff("FAKE"));
  });
});

describe("Compare automotive (50)", () => {
  for (let i = 0; i < 50; i++) {
    it(`auto ${i + 1}`, () => {
      const a = auto(`a-${i}`, { price: 14000 + i * 10, year: 2020 + (i % 4), mileage: 50000 + i * 100 });
      const b = auto(`b-${i}`, { price: 16000 + i * 10, year: 2019, mileage: 90000 + i * 100, vautoScore: 60 });
      const ids = i % 5 === 0 ? [a.id, b.id, auto(`c-${i}`).id] : [a.id, b.id];
      const listings =
        ids.length === 3 ? [a, b, auto(`c-${i}`, { price: 15500 })] : [a, b];
      const res = compareListingsSync(
        { listingIds: ids },
        listings,
        AT
      );
      assertInvariants(res, ids);
      assert.equal(res.status, "AVAILABLE");
      assert.equal(res.contextualBestListingId, null);
      assert.ok(res.keyTakeaways.some((t) => /laimėtojas|laimetoja/i.test(t) || /konteksto/i.test(t)));
      assert.ok(res.deltas.PRICE_DIFF_EUR);
    });
  }
});

describe("Compare electronics (35)", () => {
  for (let i = 0; i < 35; i++) {
    it(`electronics ${i + 1}`, () => {
      const a = phone(`p-a-${i}`, { price: 450 + i, storageGb: 128, batteryHealthVerified: true });
      const b = phone(`p-b-${i}`, {
        price: 550 + i,
        storageGb: 256,
        batteryHealthVerified: false,
        batteryHealthPercent: 99, // must remain N/A when not verified
        warrantyMonths: 0,
      });
      const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
      assertInvariants(res, [a.id, b.id]);
      assert.equal(res.status, "AVAILABLE");
      const snapB = res.comparedListings.find((l) => l.listingId === b.id)!;
      assert.equal(snapB.attributes.batteryHealthPercent, null);
      assert.ok(res.deltas.STORAGE_DIFF_GB || res.deltas.PRICE_DIFF_EUR);
    });
  }
});

describe("Compare generic (25)", () => {
  for (let i = 0; i < 25; i++) {
    it(`generic ${i + 1}`, () => {
      const a = home(`h-a-${i}`, { price: 80 + i });
      const b = home(`h-b-${i}`, { price: 140 + i, delivery: ["omniva"] });
      const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
      assertInvariants(res, [a.id, b.id]);
      assert.equal(res.status, "AVAILABLE");
    });
  }
});

describe("Compare missing-data N/A (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`missing ${i + 1}`, () => {
      const a = auto(`m-a-${i}`, { mileage: null, year: 2021 });
      const b = auto(`m-b-${i}`, { mileage: 70000, year: null, fuel: null });
      const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
      assertInvariants(res, [a.id, b.id]);
      assert.equal(res.comparedListings[0].attributes.mileage, null);
      assert.equal(res.comparedListings[1].attributes.year, null);
      // null cannot produce mileage delta when one side null — if both null no key; one null → no pair
      if (res.deltas.MILEAGE_DIFF_KM) {
        assert.fail("mileage delta must not exist when one side is null");
      }
      // YEAR_DIFF also absent when one null
      assert.equal(res.deltas.YEAR_DIFF, undefined);
    });
  }
});

describe("Compare buyer-context (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`buyer-context ${i + 1}`, () => {
      const a = auto(`bc-a-${i}`, {
        price: 14000,
        year: 2022,
        mileage: 40000,
        distanceKm: 15,
        model: "320",
      });
      const b = auto(`bc-b-${i}`, {
        price: 17000,
        year: 2020,
        mileage: 100000,
        distanceKm: 60,
        model: "320",
      });
      const req: CompareRequest = {
        listingIds: [a.id, b.id],
        buyerContext: {
          hardConstraints: {
            category: "vehicles",
            brand: "BMW",
            priceMax: 18000,
            yearMin: 2020,
            radiusKm: 100,
          },
          preferences: { preferredModels: ["320"] },
        },
      };
      const res = compareListingsSync(req, [a, b], AT);
      assertInvariants(res, [a.id, b.id]);
      assert.equal(res.status, "AVAILABLE");
      assert.ok(res.contextualBestListingId != null);
      assert.ok(requestedHas(res, a.id) || requestedHas(res, b.id));
      assert.ok(
        res.comparedListings.every(
          (l) => l.buyerMatchScore == null || (l.buyerMatchScore >= 0 && l.buyerMatchScore <= 100)
        )
      );
    });
  }
});

function requestedHas(res: CompareResponse, id: string) {
  return res.comparedListings.some((l) => l.listingId === id);
}

describe("Compare stale / revalidation (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`stale ${i + 1}`, () => {
      const a = auto(`st-a-${i}`, { price: 15000, priceSnapshot: 14000 });
      const b = auto(`st-b-${i}`);
      const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
      assert.equal(res.status, "STALE_SNAPSHOT");
      assert.equal(res.comparedListings.length, 0);
    });
  }
});

describe("Compare cross-category (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`cross ${i + 1}`, () => {
      const a = auto(`x-a-${i}`);
      const b = phone(`x-b-${i}`);
      const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
      assertInvariants(res, [a.id, b.id]);
      assert.equal(res.status, "AVAILABLE");
      assert.ok(res.warnings.includes("cross_category_compare"));
    });
  }
});

describe("Compare adversarial / injection / IDOR (10)", () => {
  it("rejects 1 listing", () => {
    const a = auto("one");
    const res = compareListingsSync({ listingIds: ["one"] } as CompareRequest, [a], AT);
    assert.equal(res.status, "INVALID_REQUEST");
  });

  it("rejects 5 listings", () => {
    const ids = ["1", "2", "3", "4", "5"];
    const listings = ids.map((id) => auto(id));
    const res = compareListingsSync({ listingIds: ids } as CompareRequest, listings, AT);
    assert.equal(res.status, "INVALID_REQUEST");
  });

  it("rejects duplicate ids", () => {
    const a = auto("dup");
    const res = compareListingsSync({ listingIds: ["dup", "dup"] }, [a], AT);
    assert.equal(res.status, "INVALID_REQUEST");
  });

  it("hallucinated id → UNAUTHORIZED", () => {
    const a = auto("real");
    const b = auto("real2");
    const res = compareListingsSync(
      { listingIds: ["real", "ghost-hallucinated"] },
      [a, b],
      AT
    );
    assert.equal(res.status, "UNAUTHORIZED");
  });

  it("private listing IDOR blocked", () => {
    const a = auto("pub");
    const b = auto("priv", {
      visibility: "private",
      ownerUserId: "owner-1",
    });
    const res = compareListingsSync(
      { listingIds: [a.id, b.id], requestUserId: "attacker" },
      [a, b],
      AT
    );
    assert.equal(res.status, "UNAUTHORIZED");
  });

  it("private listing allowed for owner", () => {
    const a = auto("pub2");
    const b = auto("priv2", {
      visibility: "private",
      ownerUserId: "owner-1",
    });
    const res = compareListingsSync(
      { listingIds: [a.id, b.id], requestUserId: "owner-1" },
      [a, b],
      AT
    );
    assert.equal(res.status, "AVAILABLE");
  });

  it("explanation rejects invented number", () => {
    const a = auto("ex1", { price: 15000 });
    const b = auto("ex2", { price: 16000 });
    const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
    const g = explanationCompareGuard(res, "Kaina skiriasi 999999 €", res.deltas as never);
    assert.equal(g.ok, false);
  });

  it("explanation rejects reorder", () => {
    const a = auto("ord1", { price: 12000 });
    const b = auto("ord2", { price: 18000 });
    const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
    const g = explanationCompareGuard(
      res,
      `Pirma ${b.id}, tada ${a.id}`,
      res.deltas as never
    );
    assert.equal(g.ok, false);
  });

  it("explanation rejects absolute winner without context", () => {
    const a = auto("w1");
    const b = auto("w2");
    const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
    assert.equal(res.contextualBestListingId, null);
    const g = explanationCompareGuard(
      res,
      "Aiškus nugalėtojas yra w1",
      res.deltas as never
    );
    assert.equal(g.ok, false);
  });

  it("LLM reject returns template", async () => {
    const a = auto("l1");
    const b = auto("l2");
    const res = compareListingsSync({ listingIds: [a.id, b.id] }, [a, b], AT);
    const out = await explainCompare(res, res.deltas as never, async () => "Laimėtojas su kaina 777777");
    assert.equal(out.rejected, true);
  });
});

describe("Compare malformed IDs (5)", () => {
  for (let i = 0; i < 5; i++) {
    it(`malformed ${i + 1}`, () => {
      const a = auto(`ok-${i}`);
      const res = compareListingsSync(
        { listingIds: [`ok-${i}`, `missing-${i}`] },
        [a],
        AT
      );
      assert.equal(res.status, "UNAUTHORIZED");
      assert.equal(res.comparedListings.length, 0);
    });
  }
});

describe("Compare performance p50/p95", () => {
  it("latency", () => {
    const listings = [auto("perf-a"), auto("perf-b"), auto("perf-c"), phone("perf-d")];
    const samples: number[] = [];
    for (let i = 0; i < 80; i++) {
      const t0 = performance.now();
      compareListingsSync(
        { listingIds: ["perf-a", "perf-b", "perf-c"] },
        listings.slice(0, 3),
        AT
      );
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    assert.ok(p50 < 40, `p50 ${p50}`);
    assert.ok(p95 < 100, `p95 ${p95}`);
  });
});
