/**
 * Market Intelligence Engine 1.0 — golden dataset + invariant suite (150+).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adviseSellDraftPrice,
  askingPriceVsMarket,
  computeValuation,
  explainValuation,
  explanationGuard,
  MARKET_INTELLIGENCE_VERSION,
  MIN_SAMPLES_BY_LEVEL,
  parseValuationResult,
  type MarketObservation,
  type MarketSubject,
} from "../index.js";
import { deduplicateObservations } from "../deduplication.js";
import { controlOutliers } from "../outlier-control.js";
import { timeDecayWeight, roundOrientation } from "../statistics.js";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86400_000).toISOString();
}

function obs(partial: Partial<MarketObservation> & Pick<MarketObservation, "id" | "price">): MarketObservation {
  return {
    category: "vehicles",
    brand: "BMW",
    model: "320",
    year: 2018,
    location: "Vilnius",
    priceSource: "ASKING_PRICE",
    observedAt: daysAgo(10),
    ...partial,
  };
}

function cluster(
  n: number,
  basePrice: number,
  opts?: Partial<MarketObservation> & { jitter?: number; prefix?: string }
): MarketObservation[] {
  const jitter = opts?.jitter ?? 200;
  const { jitter: _j, prefix, ...rest } = opts ?? {};
  return Array.from({ length: n }, (_, i) =>
    obs({
      id: `${prefix ?? "c"}-${i}`,
      price: basePrice + (i % 5) * jitter - jitter,
      observedAt: daysAgo(i * 3),
      ...rest,
    })
  );
}

function assertInvariants(v: ReturnType<typeof computeValuation>, originalHint?: number) {
  parseValuationResult(v);
  assert.ok(v.confidence >= 0 && v.confidence <= 1);
  assert.ok(v.acceptedComparableCount <= v.originalComparableCount);
  if (originalHint != null) {
    assert.ok(v.originalComparableCount <= originalHint + 50);
  }
  if (v.status === "INSUFFICIENT_DATA") {
    assert.equal(v.estimatedRange, null);
    assert.equal(v.comparableLevel, "INSUFFICIENT_DATA");
  }
  if (v.estimatedRange) {
    const { low, median, high } = v.estimatedRange;
    assert.ok(low <= median && median <= high, `${low}<=${median}<=${high}`);
    // no false precision: orientation round → divisible by 10 at least
    assert.equal(low % 10, 0);
    assert.equal(high % 10, 0);
  }
  assert.equal(v.methodologyVersion, MARKET_INTELLIGENCE_VERSION);
  assert.equal(v.currency, "EUR");
}

describe("MI 1.0 unit primitives", () => {
  it("deduplicates by dedupeKey keeping newest", () => {
    const a = obs({
      id: "a",
      price: 18000,
      dedupeKey: "same",
      observedAt: daysAgo(20),
    });
    const b = obs({
      id: "b",
      price: 18000,
      dedupeKey: "same",
      observedAt: daysAgo(2),
    });
    const d = deduplicateObservations([a, b]);
    assert.equal(d.unique.length, 1);
    assert.equal(d.unique[0].id, "b");
    assert.equal(d.removedCount, 1);
  });

  it("IQR rejects €1 and €92000 extremes", () => {
    const items = [
      ...[18000, 18200, 17900, 18100, 18300, 18050, 18150].map((p, i) => ({
        id: `n${i}`,
        price: p,
      })),
      { id: "low", price: 1 },
      { id: "high", price: 92000 },
    ];
    const r = controlOutliers(items);
    assert.ok(r.excluded.some((e) => e.id === "low"));
    assert.ok(r.excluded.some((e) => e.id === "high"));
    assert.ok(r.acceptedComparableCount >= 5);
    assert.ok(Math.abs(r.median - 18050) < 300);
  });

  it("time decay lowers weight for stale comps", () => {
    const fresh = timeDecayWeight(daysAgo(1), NOW);
    const stale = timeDecayWeight(daysAgo(180), NOW);
    assert.ok(fresh > stale);
    assert.ok(stale < 0.2);
  });

  it("roundOrientation avoids false precision", () => {
    assert.equal(roundOrientation(18437), 18400);
  });
});

describe("MI 1.0 automotive golden (45)", () => {
  for (let i = 0; i < 45; i++) {
    it(`auto case ${i + 1}`, () => {
      const brand = i % 3 === 0 ? "BMW" : i % 3 === 1 ? "Audi" : "VW";
      const model = i % 3 === 0 ? "320" : i % 3 === 1 ? "A4" : "Golf";
      const base = 12000 + i * 350;
      const location = i % 2 === 0 ? "Vilnius" : "Kaunas";
      const subject: MarketSubject = {
        category: "vehicles",
        brand,
        model,
        year: 2016 + (i % 5),
        location,
      };
      const observations = cluster(8 + (i % 5), base, {
        brand,
        model,
        year: subject.year!,
        location,
        prefix: `auto${i}`,
        priceSource: i % 7 === 0 ? "TRANSACTION_PRICE" : "ASKING_PRICE",
      });
      const v = computeValuation({ subject, observations, now: NOW });
      assertInvariants(v, observations.length);
      assert.equal(v.status, "AVAILABLE");
      assert.ok(v.estimatedRange);
      assert.ok(
        ["LOCAL_STRICT", "LOCAL_RELAXED", "CATEGORY_RELAXED"].includes(
          v.comparableLevel
        )
      );
      if (i === 0) {
        const advice = adviseSellDraftPrice(base + 5000, v);
        assert.equal(advice.overwriteUserPrice, false);
        assert.ok(
          advice.askingPriceVsMarket === "ABOVE_RANGE" ||
            advice.askingPriceVsMarket === "WITHIN_RANGE"
        );
      }
    });
  }
});

describe("MI 1.0 electronics golden (30)", () => {
  for (let i = 0; i < 30; i++) {
    it(`electronics case ${i + 1}`, () => {
      const brand = "Apple";
      const model = i % 2 === 0 ? "iPhone 13" : "iPhone 14";
      const base = 400 + i * 15;
      const subject: MarketSubject = {
        category: "electronics",
        brand,
        model,
        location: i % 3 === 0 ? "Vilnius" : undefined,
      };
      const observations = cluster(7 + (i % 4), base, {
        category: "electronics",
        brand,
        model,
        location: subject.location ?? "Vilnius",
        year: null,
        prefix: `el${i}`,
        jitter: 20,
      });
      const v = computeValuation({ subject, observations, now: NOW });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
      assert.ok(v.priceBasis === "ASKING_PRICE" || v.priceBasis === "MIXED");
    });
  }
});

describe("MI 1.0 generic / unsupported (20)", () => {
  for (let i = 0; i < 12; i++) {
    it(`generic home case ${i + 1}`, () => {
      const subject: MarketSubject = {
        category: "home",
        brand: "IKEA",
        model: `Sofa-${i}`,
        location: "Vilnius",
      };
      const observations = cluster(8, 200 + i * 10, {
        category: "home",
        brand: "IKEA",
        model: `Sofa-${i}`,
        location: "Vilnius",
        year: null,
        prefix: `home${i}`,
        jitter: 15,
      });
      const v = computeValuation({ subject, observations, now: NOW });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
    });
  }
  for (let i = 0; i < 8; i++) {
    it(`unsupported case ${i + 1}`, () => {
      const v = computeValuation({
        subject: { category: "unsupported", brand: "X" },
        observations: cluster(20, 1000, { prefix: `un${i}` }),
        now: NOW,
      });
      assertInvariants(v);
      assert.equal(v.status, "UNSUPPORTED");
      assert.equal(v.estimatedRange, null);
    });
  }
});

describe("MI 1.0 sparse / INSUFFICIENT_DATA (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`sparse case ${i + 1}`, () => {
      const n = i % 5; // 0..4 — below LOCAL min of 5
      const subject: MarketSubject = {
        category: "vehicles",
        brand: "Toyota",
        model: "Corolla",
        year: 2015,
        location: "Klaipėda",
      };
      const observations = cluster(n, 9000, {
        brand: "Toyota",
        model: "Corolla",
        year: 2015,
        location: "Klaipėda",
        prefix: `sp${i}`,
      });
      const v = computeValuation({ subject, observations, now: NOW });
      assertInvariants(v);
      assert.equal(v.status, "INSUFFICIENT_DATA");
      assert.equal(v.estimatedRange, null);
      assert.equal(v.confidence, 0);
    });
  }
});

describe("MI 1.0 outliers stable median (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`outlier case ${i + 1}`, () => {
      const base = 15000 + i * 100;
      const clean = cluster(8, base, {
        brand: "BMW",
        model: "520",
        year: 2017,
        location: "Vilnius",
        prefix: `outc${i}`,
        jitter: 150,
      });
      const dirty: MarketObservation[] = [
        ...clean,
        obs({
          id: `out-low-${i}`,
          price: 1,
          brand: "BMW",
          model: "520",
          year: 2017,
          location: "Vilnius",
        }),
        obs({
          id: `out-high-${i}`,
          price: 92000 + i * 1000,
          brand: "BMW",
          model: "520",
          year: 2017,
          location: "Vilnius",
        }),
      ];
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "520",
          year: 2017,
          location: "Vilnius",
        },
        observations: dirty,
        now: NOW,
      });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
      assert.ok(v.excludedOutlierCount >= 1);
      assert.ok(v.estimatedRange);
      assert.ok(Math.abs(v.estimatedRange.median - base) < base * 0.15);
    });
  }
});

describe("MI 1.0 duplicates (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`duplicate case ${i + 1}`, () => {
      const key = `dup-key-${i}`;
      const base = cluster(6, 11000 + i * 50, {
        brand: "Audi",
        model: "A6",
        year: 2016,
        location: "Kaunas",
        prefix: `dup${i}`,
        dedupeKey: undefined,
      }).map((o, j) => ({
        ...o,
        dedupeKey: j < 3 ? key : `${key}-${j}`,
        id: `dup-${i}-${j}`,
      }));
      // force 3 identical republishes
      base[0].dedupeKey = key;
      base[1].dedupeKey = key;
      base[2].dedupeKey = key;
      // add more unique to meet min after dedupe
      const extra = cluster(4, 11000 + i * 50, {
        brand: "Audi",
        model: "A6",
        year: 2016,
        location: "Kaunas",
        prefix: `dupex${i}`,
      });
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "Audi",
          model: "A6",
          year: 2016,
          location: "Kaunas",
        },
        observations: [...base, ...extra],
        now: NOW,
      });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
      // accepted should not exceed unique pool size
      assert.ok(v.acceptedComparableCount <= 10);
    });
  }
});

describe("MI 1.0 stale data (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`stale case ${i + 1}`, () => {
      const fresh = cluster(5, 16000, {
        brand: "VW",
        model: "Passat",
        year: 2018,
        location: "Vilnius",
        prefix: `stF${i}`,
        observedAt: daysAgo(5),
      });
      const stale = cluster(5, 22000, {
        brand: "VW",
        model: "Passat",
        year: 2018,
        location: "Vilnius",
        prefix: `stS${i}`,
        observedAt: daysAgo(200 + i),
      });
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "VW",
          model: "Passat",
          year: 2018,
          location: "Vilnius",
        },
        observations: [...fresh, ...stale],
        now: NOW,
      });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
      // weighted toward fresher ~16k cluster
      assert.ok(v.estimatedRange!.median < 20000);
      assert.ok(v.confidence < 0.95);
    });
  }
});

describe("MI 1.0 adversarial / malformed (10)", () => {
  const cases: Array<() => void> = [
    () => {
      const v = computeValuation({
        subject: { category: "vehicles", brand: "BMW", model: "320", location: "Vilnius", year: 2018 },
        observations: [
          obs({ id: "neg", price: -5 }),
          obs({ id: "nan", price: Number.NaN }),
          ...cluster(6, 17000, { prefix: "adv0" }),
        ],
        now: NOW,
      });
      assertInvariants(v);
      assert.equal(v.status, "AVAILABLE");
    },
    () => {
      const v = computeValuation({
        subject: { category: "vehicles", brand: "BMW", model: "320", location: "Vilnius", year: 2018 },
        observations: cluster(6, 17000, {
          prefix: "adv1",
          priceSource: "VERIFIED_EXTERNAL",
          externalApproved: false,
        }),
        now: NOW,
      });
      assert.equal(v.status, "INSUFFICIENT_DATA");
    },
    () => {
      const v = computeValuation({
        subject: { category: "vehicles", brand: "BMW", model: "320", year: 2018 },
        observations: [],
        now: NOW,
      });
      assert.equal(v.estimatedRange, null);
    },
    () => {
      const v = computeValuation({
        subject: { category: "electronics", brand: "Apple", model: "iPhone 13" },
        observations: cluster(6, 500, {
          category: "vehicles",
          brand: "Apple",
          model: "iPhone 13",
          prefix: "adv3",
        }),
        now: NOW,
      });
      assert.equal(v.status, "INSUFFICIENT_DATA");
    },
    () => {
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "320",
          location: "Vilnius",
          year: 2018,
        },
        observations: cluster(6, 17000, {
          brand: "Audi",
          model: "A4",
          prefix: "adv4",
        }),
        now: NOW,
      });
      assert.equal(v.status, "INSUFFICIENT_DATA");
    },
    () => {
      const r = askingPriceVsMarket(null, {
        status: "AVAILABLE",
        currency: "EUR",
        estimatedRange: { low: 1, median: 2, high: 3 },
        comparableCount: 5,
        acceptedComparableCount: 5,
        excludedOutlierCount: 0,
        originalComparableCount: 5,
        comparableLevel: "LOCAL_STRICT",
        confidence: 0.8,
        confidenceBand: "HIGH",
        priceBasis: "ASKING_PRICE",
        dataFreshness: { newestAt: null, oldestAt: null },
        warnings: [],
        methodologyVersion: "1.0",
      });
      assert.equal(r, "UNKNOWN");
    },
    () => {
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "320",
          location: "Vilnius",
          year: 2018,
        },
        observations: cluster(8, 18000, { prefix: "adv6" }),
        now: NOW,
      });
      const g = explanationGuard(v, "Rinka yra 999999 € pagal mano nuomonę");
      assert.equal(g.ok, false);
      assert.ok(g.text.includes(String(v.estimatedRange!.low)));
    },
    () => {
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "320",
          location: "Vilnius",
          year: 2018,
        },
        observations: cluster(8, 18000, { prefix: "adv7" }),
        now: NOW,
      });
      const okText = `Intervalas ${v.estimatedRange!.low}–${v.estimatedRange!.high} €, median ${v.estimatedRange!.median} €, n=${v.acceptedComparableCount}`;
      assert.equal(explanationGuard(v, okText).ok, true);
    },
    async () => {
      const v = computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "320",
          location: "Vilnius",
          year: 2018,
        },
        observations: cluster(8, 18000, { prefix: "adv8" }),
        now: NOW,
      });
      const explained = await explainValuation(v, async () => "Inventuota kaina 777777 €");
      assert.equal(explained.rejected, true);
      assert.equal(explained.source, "template");
    },
    () => {
      assert.ok(MIN_SAMPLES_BY_LEVEL.LOCAL_STRICT >= 5);
      assert.ok(MIN_SAMPLES_BY_LEVEL.APPROVED_EXTERNAL >= MIN_SAMPLES_BY_LEVEL.LOCAL_STRICT);
    },
  ];

  cases.forEach((fn, i) => {
    it(`adversarial case ${i + 1}`, async () => {
      await fn();
    });
  });
});

describe("MI 1.0 expansion ladder confidence drops", () => {
  it("wider level reduces confidence vs local strict", () => {
    const local = computeValuation({
      subject: {
        category: "vehicles",
        brand: "BMW",
        model: "320",
        year: 2018,
        location: "Vilnius",
      },
      observations: cluster(10, 18000, {
        brand: "BMW",
        model: "320",
        year: 2018,
        location: "Vilnius",
        prefix: "loc",
      }),
      now: NOW,
    });
    const relaxed = computeValuation({
      subject: {
        category: "vehicles",
        brand: "BMW",
        model: "320",
        year: 2018,
        location: "Klaipėda", // no local matches
      },
      observations: [
        ...cluster(10, 18000, {
          brand: "BMW",
          model: "320",
          year: 2018,
          location: "Vilnius",
          prefix: "rel",
        }),
      ],
      now: NOW,
    });
    assert.equal(local.status, "AVAILABLE");
    assert.equal(local.comparableLevel, "LOCAL_STRICT");
    // May be LOCAL_RELAXED (location includes) or CATEGORY_RELAXED
    assert.notEqual(relaxed.comparableLevel, "LOCAL_STRICT");
    if (relaxed.status === "AVAILABLE") {
      assert.ok(relaxed.confidence <= local.confidence + 0.001);
    }
  });
});

describe("MI 1.0 latency smoke", () => {
  it("100 valuations under 500ms", () => {
    const observations = cluster(30, 17500, { prefix: "perf" });
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      computeValuation({
        subject: {
          category: "vehicles",
          brand: "BMW",
          model: "320",
          year: 2018,
          location: "Vilnius",
        },
        observations,
        now: NOW,
      });
    }
    const ms = Date.now() - t0;
    assert.ok(ms < 500, `latency ${ms}ms`);
  });
});
