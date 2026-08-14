/**
 * VAUTO Score 1.0 — golden dataset (180+) + invariants.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ValuationResult } from "../../market-intelligence/valuation-schema.js";
import {
  REASON_CODE_ALLOWLIST,
  REASON_CODE_SET,
  SCORE_WEIGHTS,
  VAUTO_SCORE_VERSION,
  computeVautoScore,
  explainVautoScore,
  explanationMathGuard,
  isAllowedReasonCode,
  normalizeDemandEvents,
  parseVautoScoreResult,
  scoreSellerTrust,
  type DemandEvent,
  type VautoScoreInput,
  type VautoScoreResult,
} from "../index.js";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function marketAvailable(low = 17000, median = 18000, high = 19000): ValuationResult {
  return {
    status: "AVAILABLE",
    currency: "EUR",
    estimatedRange: { low, median, high },
    comparableCount: 10,
    acceptedComparableCount: 8,
    excludedOutlierCount: 2,
    originalComparableCount: 10,
    comparableLevel: "LOCAL_STRICT",
    confidence: 0.82,
    confidenceBand: "HIGH",
    priceBasis: "ASKING_PRICE",
    dataFreshness: { newestAt: NOW.toISOString(), oldestAt: NOW.toISOString() },
    warnings: [],
    methodologyVersion: "1.0",
  };
}

function baseListing(i = 0): NonNullable<VautoScoreInput["listing"]> {
  return {
    photoCount: 4 + (i % 4),
    presentAttributeKeys: ["brand", "model", "condition", "category", "year"],
    expectedAttributeKeys: ["brand", "model", "condition", "category", "year"],
    descriptionLength: 120 + i * 3,
    titleLength: 40,
  };
}

function baseSeller(i = 0): NonNullable<VautoScoreInput["seller"]> {
  return {
    identityVerified: true,
    accountAgeDays: 400 + i,
    completedTransactions: 12 + (i % 5),
    successfulDeliveries: 10,
    disputeRate: 0.02,
  };
}

function baseTx(): NonNullable<VautoScoreInput["transaction"]> {
  return {
    escrowAvailable: true,
    omnivaAvailable: true,
    buyerProtectionAvailable: true,
  };
}

function demandEvents(
  n: number,
  type: DemandEvent["type"],
  opts?: { actorPrefix?: string; ownerId?: string; burst?: boolean }
): DemandEvent[] {
  const out: DemandEvent[] = [];
  for (let i = 0; i < n; i++) {
    const actor = opts?.burst
      ? "bot-session"
      : `${opts?.actorPrefix ?? "u"}-${i}`;
    out.push({
      type,
      at: new Date(NOW.getTime() - i * (opts?.burst ? 1000 : 3600_000)).toISOString(),
      actorId: opts?.ownerId && i === 0 ? opts.ownerId : actor,
      sessionKey: opts?.burst ? "same-session" : `s-${actor}`,
    });
  }
  return out;
}

function fullInput(i: number, patch?: Partial<VautoScoreInput>): VautoScoreInput {
  const asking = 17500 + (i % 10) * 100;
  return {
    askingPrice: asking,
    marketValuation: marketAvailable(),
    askingPriceVsMarket: "WITHIN_RANGE",
    listing: baseListing(i),
    seller: baseSeller(i),
    demand: {
      events: [
        ...demandEvents(20 + (i % 5), "view", { actorPrefix: `v${i}` }),
        ...demandEvents(3, "favorite", { actorPrefix: `f${i}` }),
        ...demandEvents(2, "inquiry", { actorPrefix: `q${i}` }),
      ],
      listingOwnerId: `seller-${i}`,
      now: NOW,
    },
    transaction: baseTx(),
    calculatedAt: NOW.toISOString(),
    ...patch,
  };
}

function assertInvariants(r: VautoScoreResult) {
  parseVautoScoreResult(r);
  assert.equal(r.scoreVersion, VAUTO_SCORE_VERSION);
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  if (r.status === "INSUFFICIENT_DATA") {
    assert.equal(r.totalScore, null);
  }
  if (r.totalScore != null) {
    assert.ok(r.totalScore >= 0 && r.totalScore <= 100);
  }
  for (const c of Object.values(r.components)) {
    if (c.score != null) {
      assert.ok(c.score >= 0 && c.score <= 100);
      // missing signal must not be fake mid-default with zero confidence empty reasons
      // (explicit N/A is null)
    }
    assert.ok(c.confidence >= 0 && c.confidence <= 1);
    for (const code of c.reasonCodes) {
      assert.ok(REASON_CODE_SET.has(code), `not allowlisted: ${code}`);
      assert.ok(isAllowedReasonCode(code));
    }
  }
}

describe("VAUTO Score 1.0 unit / schema", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it("allowlist is non-empty", () => {
    assert.ok(REASON_CODE_ALLOWLIST.length >= 30);
  });
});

describe("VAUTO Score automotive golden (50)", () => {
  for (let i = 0; i < 50; i++) {
    it(`auto ${i + 1}`, () => {
      const vs =
        i % 5 === 0 ? "BELOW_RANGE" : i % 5 === 1 ? "ABOVE_RANGE" : "WITHIN_RANGE";
      const asking =
        vs === "BELOW_RANGE" ? 16000 : vs === "ABOVE_RANGE" ? 24000 : 18000;
      const r = computeVautoScore(
        fullInput(i, {
          askingPrice: asking,
          askingPriceVsMarket: vs,
          marketValuation: marketAvailable(),
        })
      );
      assertInvariants(r);
      assert.notEqual(r.status, "INSUFFICIENT_DATA");
      assert.ok(r.totalScore != null);
      assert.ok(r.components.priceValue.score != null);
      if (vs === "WITHIN_RANGE") {
        assert.ok(
          r.components.priceValue.reasonCodes.includes("PRICE_WITHIN_MARKET_RANGE")
        );
      }
    });
  }
});

describe("VAUTO Score electronics golden (35)", () => {
  for (let i = 0; i < 35; i++) {
    it(`electronics ${i + 1}`, () => {
      const r = computeVautoScore(
        fullInput(i, {
          askingPrice: 450 + i * 5,
          marketValuation: marketAvailable(400, 480, 560),
          askingPriceVsMarket: "WITHIN_RANGE",
          listing: {
            photoCount: 3,
            presentAttributeKeys: ["brand", "model", "condition", "category"],
            expectedAttributeKeys: ["brand", "model", "condition", "category"],
            descriptionLength: 90,
          },
        })
      );
      assertInvariants(r);
      assert.ok(r.totalScore != null && r.totalScore > 40);
    });
  }
});

describe("VAUTO Score generic golden (25)", () => {
  for (let i = 0; i < 25; i++) {
    it(`generic ${i + 1}`, () => {
      const r = computeVautoScore(
        fullInput(i, {
          askingPrice: 80 + i,
          marketValuation: marketAvailable(50, 90, 120),
          askingPriceVsMarket: i % 2 === 0 ? "WITHIN_RANGE" : "BELOW_RANGE",
          listing: {
            photoCount: 2 + (i % 3),
            presentAttributeKeys: ["brand", "condition", "category"],
            expectedAttributeKeys: ["brand", "model", "condition", "category"],
            descriptionLength: 40 + i * 2,
          },
        })
      );
      assertInvariants(r);
      assert.ok(r.totalScore != null);
    });
  }
});

describe("VAUTO Score missing-data N/A not 50 (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`missing ${i + 1}`, () => {
      let r: VautoScoreResult;
      if (i < 5) {
        // no price / market
        r = computeVautoScore({
          listing: baseListing(i),
          transaction: baseTx(),
          calculatedAt: NOW.toISOString(),
        });
        assert.equal(r.components.priceValue.score, null);
      } else if (i < 10) {
        r = computeVautoScore({
          askingPrice: 1000,
          marketValuation: {
            ...marketAvailable(),
            status: "INSUFFICIENT_DATA",
            estimatedRange: null,
            confidence: 0,
            confidenceBand: "LOW",
            comparableLevel: "INSUFFICIENT_DATA",
          },
          listing: baseListing(),
          transaction: baseTx(),
          calculatedAt: NOW.toISOString(),
        });
        assert.equal(r.components.priceValue.score, null);
        assert.ok(!r.missingSignals.includes("fake50"));
      } else if (i < 15) {
        r = computeVautoScore({
          listing: null,
          seller: null,
          demand: null,
          transaction: null,
          calculatedAt: NOW.toISOString(),
        });
        assert.equal(r.status, "INSUFFICIENT_DATA");
        assert.equal(r.totalScore, null);
      } else {
        r = computeVautoScore({
          demand: { events: [], now: NOW },
          calculatedAt: NOW.toISOString(),
        });
        assert.equal(r.components.demand.score, 0); // empty events = low demand scored
        // ensure no component defaults to magic 50 from missing
        for (const [k, c] of Object.entries(r.components)) {
          if (c.score === 50 && c.confidence === 0) {
            assert.fail(`fake default 50 on ${k}`);
          }
        }
      }
      assertInvariants(r);
      // Critical: missing components are null, never 50
      if (i < 10) {
        assert.notEqual(r.components.priceValue.score, 50);
        assert.equal(r.components.priceValue.score, null);
      }
    });
  }
});

describe("VAUTO Score new-seller no unjust penalty (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`new-seller ${i + 1}`, () => {
      const withNew = computeVautoScore(
        fullInput(i, {
          seller: {
            isNewSeller: true,
            accountAgeDays: 5,
            completedTransactions: 0,
          },
        })
      );
      const withoutSeller = computeVautoScore(
        fullInput(i, { seller: null })
      );
      assertInvariants(withNew);
      assertInvariants(withoutSeller);
      assert.equal(withNew.components.sellerTrust.score, null);
      assert.ok(
        withNew.components.sellerTrust.reasonCodes.includes("NEW_SELLER_NO_HISTORY")
      );
      // New seller must not drag total below a listing that simply omits seller
      if (withNew.totalScore != null && withoutSeller.totalScore != null) {
        assert.ok(
          withNew.totalScore + 0.05 >= withoutSeller.totalScore - 5,
          "new seller should not be harshly punished vs missing seller"
        );
      }
      // Direct unit: new seller trust is N/A
      const st = scoreSellerTrust({
        isNewSeller: true,
        completedTransactions: 0,
        accountAgeDays: 3,
      });
      assert.equal(st.component.score, null);
    });
  }
});

describe("VAUTO Score manipulation resistance (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`manipulation ${i + 1}`, () => {
      const owner = `owner-${i}`;
      const organic = computeVautoScore(
        fullInput(i, {
          demand: {
            events: [
              ...demandEvents(15, "view", { actorPrefix: `org${i}` }),
              ...demandEvents(2, "favorite", { actorPrefix: `orgf${i}` }),
            ],
            listingOwnerId: owner,
            now: NOW,
          },
        })
      );
      const spam = computeVautoScore(
        fullInput(i, {
          demand: {
            events: [
              ...demandEvents(15, "view", { actorPrefix: `org${i}` }),
              ...demandEvents(2, "favorite", { actorPrefix: `orgf${i}` }),
              // burst same session
              ...demandEvents(200, "view", { burst: true }),
              // self favorites
              ...Array.from({ length: 50 }, (_, j) => ({
                type: "favorite" as const,
                at: new Date(NOW.getTime() - j * 1000).toISOString(),
                actorId: owner,
                sessionKey: "self",
              })),
            ],
            listingOwnerId: owner,
            now: NOW,
          },
        })
      );
      assertInvariants(organic);
      assertInvariants(spam);
      assert.ok(organic.components.demand.score != null);
      assert.ok(spam.components.demand.score != null);
      // Spam must not inflate demand score by more than a small margin
      assert.ok(
        spam.components.demand.score! <= organic.components.demand.score! + 8,
        `spam ${spam.components.demand.score} vs organic ${organic.components.demand.score}`
      );
      const norm = normalizeDemandEvents({
        events: demandEvents(100, "view", { burst: true }),
        listingOwnerId: owner,
        now: NOW,
      });
      assert.ok(norm.views < 20);
      assert.ok(norm.filteredEventCount > 50);
    });
  }
});

describe("VAUTO Score stability / monotonicity (10)", () => {
  for (let i = 0; i < 10; i++) {
    it(`stability ${i + 1}`, () => {
      const base = computeVautoScore(
        fullInput(i, {
          seller: {
            identityVerified: false,
            accountAgeDays: 100,
            completedTransactions: 4,
            successfulDeliveries: 3,
            disputeRate: 0.04,
          },
          transaction: {
            escrowAvailable: false,
            omnivaAvailable: true,
            buyerProtectionAvailable: false,
          },
        })
      );
      const improved = computeVautoScore(
        fullInput(i, {
          seller: {
            identityVerified: true,
            accountAgeDays: 100,
            completedTransactions: 4,
            successfulDeliveries: 3,
            disputeRate: 0.04,
          },
          transaction: {
            escrowAvailable: true,
            omnivaAvailable: true,
            buyerProtectionAvailable: true,
          },
        })
      );
      assertInvariants(base);
      assertInvariants(improved);
      assert.ok(base.totalScore != null && improved.totalScore != null);
      assert.ok(
        improved.totalScore! >= base.totalScore! - 0.05,
        `monotonicity broken: ${improved.totalScore} < ${base.totalScore}`
      );
      assert.ok(
        improved.components.sellerTrust.score! >=
          base.components.sellerTrust.score! - 0.05
      );
      assert.ok(
        improved.components.transactionConfidence.score! >=
          base.components.transactionConfidence.score! - 0.05
      );
    });
  }
});

describe("VAUTO Score adversarial / malformed (10)", () => {
  const cases: Array<() => void | Promise<void>> = [
    () => {
      const r = computeVautoScore({
        askingPrice: -10,
        listing: baseListing(),
        transaction: baseTx(),
        calculatedAt: NOW.toISOString(),
      });
      assert.equal(r.components.priceValue.score, null);
      assertInvariants(r);
    },
    () => {
      const r = computeVautoScore({
        askingPrice: Number.NaN,
        marketValuation: marketAvailable(),
        listing: baseListing(),
        transaction: baseTx(),
        calculatedAt: NOW.toISOString(),
      });
      assert.equal(r.components.priceValue.score, null);
    },
    () => {
      const r = computeVautoScore({
        listing: { photoCount: -1, descriptionLength: -5 },
        transaction: baseTx(),
        calculatedAt: NOW.toISOString(),
      });
      assertInvariants(r);
    },
    () => {
      const r = computeVautoScore({
        seller: { disputeRate: 2.5, completedTransactions: -3 },
        listing: baseListing(),
        transaction: baseTx(),
        calculatedAt: NOW.toISOString(),
      });
      assertInvariants(r);
    },
    () => {
      const r = computeVautoScore(fullInput(0));
      const g = explanationMathGuard(
        r,
        "Šio skelbimo balas yra 99 ir priežastis FAKE_REASON_CODE",
        r.components.priceValue.reasonCodes
      );
      // 99 not in set → reject (unless somehow equals)
      if (r.totalScore !== 99 && r.components.priceValue.score !== 99) {
        assert.equal(g.ok, false);
      }
    },
    async () => {
      const r = computeVautoScore(fullInput(1));
      const explained = await explainVautoScore(
        r,
        [...r.components.listingQuality.reasonCodes],
        async () => "Išgalvotas balas 12/100"
      );
      assert.equal(explained.rejected, true);
      assert.equal(explained.source, "template");
    },
    () => {
      const r = computeVautoScore(fullInput(2));
      const ok = explanationMathGuard(
        r,
        `VAUTO Score: ${r.totalScore}/100`,
        []
      );
      assert.equal(ok.ok, true);
    },
    () => {
      const r = computeVautoScore({});
      assert.equal(r.status, "INSUFFICIENT_DATA");
      assert.equal(r.totalScore, null);
    },
    () => {
      // Discriminatory fields are not part of input type — only allowed seller fields
      const r = computeVautoScore(
        fullInput(3, {
          seller: {
            identityVerified: true,
            completedTransactions: 20,
            accountAgeDays: 800,
            disputeRate: 0.01,
            successfulDeliveries: 18,
          },
        })
      );
      assert.ok(r.components.sellerTrust.score != null);
      assert.ok(r.components.sellerTrust.score! > 80);
    },
    () => {
      const r = computeVautoScore(
        fullInput(4, { askingPriceVsMarket: "UNKNOWN", marketValuation: null })
      );
      assert.equal(r.components.priceValue.score, null);
      assertInvariants(r);
    },
  ];

  cases.forEach((fn, i) => {
    it(`adversarial ${i + 1}`, async () => {
      await fn();
    });
  });
});

describe("VAUTO Score performance", () => {
  it("200 score computations under 500ms", () => {
    const input = fullInput(0);
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) computeVautoScore(input);
    const ms = Date.now() - t0;
    assert.ok(ms < 500, `latency ${ms}ms`);
  });
});
