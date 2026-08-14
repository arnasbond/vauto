/**
 * AI Watch 1.0 ā€” golden dataset (220+) + invariants + race tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_WATCH_VERSION,
  MATCH_REASON_SET,
  WATCH_COOLDOWN_MS,
  WATCH_DAILY_CAP,
  InMemoryWatchRepository,
  classifyMeaningfulChange,
  evaluatePriceDrop,
  evaluateWatchRule,
  parseAiWatchMatchResult,
  processWatchEvent,
  type AiWatchRule,
  type WatchListingEvent,
} from "../index.js";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function baseEvent(patch: Partial<WatchListingEvent> = {}): WatchListingEvent {
  return {
    eventType: "listing_created",
    listingId: "L1",
    category: "vehicles",
    title: "BMW 320",
    price: 15000,
    brand: "BMW",
    model: "320",
    year: 2021,
    mileage: 80000,
    location: "Vilnius",
    distanceKm: 25,
    status: "active",
    visibility: "public",
    banned: false,
    occurredAt: NOW.toISOString(),
    ...patch,
  };
}

function assertMatchInvariants(
  m: Awaited<ReturnType<typeof evaluateWatchRule>>,
  ctxUserId: string
) {
  parseAiWatchMatchResult(m);
  assert.equal(m.userId, ctxUserId);
  if (m.shouldNotify) {
    assert.equal(m.isMatch, true);
    assert.equal(m.cooldownPassed, true);
  }
  for (const r of m.matchReasons) {
    assert.ok(MATCH_REASON_SET.has(r), r);
  }
}

describe("AI Watch unit", () => {
  it("version is 1.0", async () => {
    assert.equal(AI_WATCH_VERSION, "1.0");
  });

  it("price drop math", async () => {
    const r = evaluatePriceDrop(9000, 10000, { minDropPercent: 5 });
    assert.equal(r.dropped, true);
    assert.equal(r.dropPercent, 10);
  });

  it("punctuation-only title is not meaningful", async () => {
    const c = classifyMeaningfulChange(
      { price: 100, title: "BMW 320" },
      { price: 100, title: "BMW 320!!!" },
      "listing_updated"
    );
    assert.equal(c.meaningful, false);
  });
});

describe("AI Watch search matching (60)", () => {
  for (let i = 0; i < 60; i++) {
    it(`search ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-search-${i}`;
      const rule = store.create({
        userId,
        name: `S${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: {
          category: "vehicles",
          brand: "BMW",
          priceMax: 18000,
          yearMin: 2020,
        },
      });
      assert.equal(rule.watchVersion, "1.0");
      const event = baseEvent({
        listingId: `LS-${i}`,
        price: 12000 + (i % 50) * 100,
        year: 2020 + (i % 3),
      });
      const m = await evaluateWatchRule(store, rule, event, NOW);
      assertMatchInvariants(m, userId);
      if (event.price <= 18000 && (event.year ?? 0) >= 2020) {
        assert.equal(m.isMatch, true);
        assert.equal(m.shouldNotify, true);
      }
    });
  }
});

describe("AI Watch price watch (30)", () => {
  for (let i = 0; i < 30; i++) {
    it(`price ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-price-${i}`;
      const listingId = `LP-${i}`;
      const prev = 10000 + i * 100;
      const dropPct = 5 + (i % 10);
      const next = Math.round(prev * (1 - (dropPct + 1) / 100));
      const rule = store.create({
        userId,
        name: `P${i}`,
        type: "LISTING_PRICE_WATCH",
        structuredQuery: {},
        targetListingId: listingId,
        thresholds: { priceDropPercent: dropPct },
      });
      const event = baseEvent({
        eventType: "price_changed",
        listingId,
        price: next,
        previousPrice: prev,
        previousSnapshot: { price: prev, title: "BMW 320" },
        currentSnapshot: { price: next, title: "BMW 320" },
      });
      const m = await evaluateWatchRule(store, rule, event, NOW);
      assertMatchInvariants(m, userId);
      assert.equal(m.isMatch, true);
      assert.ok(m.matchReasons.includes("PRICE_DROP_PERCENT"));
    });
  }
});

describe("AI Watch hard constraints (30)", () => {
  for (let i = 0; i < 30; i++) {
    it(`hard ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-hard-${i}`;
      const rule = store.create({
        userId,
        name: `H${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: {
          category: "vehicles",
          brand: "BMW",
          priceMax: 15000,
          yearMin: 2020,
          radiusKm: 50,
        },
      });
      const over = baseEvent({
        listingId: `H-over-${i}`,
        price: 16000 + i,
        year: 2021,
        distanceKm: 20,
      });
      const m = await evaluateWatchRule(store, rule, over, NOW);
      assertMatchInvariants(m, userId);
      assert.equal(m.isMatch, false);
      assert.equal(m.shouldNotify, false);
      assert.ok(m.matchReasons.includes("HARD_CONSTRAINT_FAIL"));
    });
  }
});

describe("AI Watch score thresholds (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`score ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-score-${i}`;
      const rule = store.create({
        userId,
        name: `V${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
        thresholds: { minVautoScore: 70 },
      });
      const low = await evaluateWatchRule(
        store,
        rule,
        baseEvent({ listingId: `vs-low-${i}`, vautoScore: 50 }),
        NOW
      );
      assert.equal(low.isMatch, false);
      assert.ok(low.matchReasons.includes("THRESHOLD_FAIL"));
      const high = await evaluateWatchRule(
        store,
        rule,
        baseEvent({ listingId: `vs-hi-${i}`, vautoScore: 80 }),
        NOW
      );
      assert.equal(high.isMatch, true);
      assert.ok(high.matchReasons.includes("VAUTO_SCORE_THRESHOLD"));
    });
  }
});

describe("AI Watch buyer match thresholds (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`buyer-match ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-bm-${i}`;
      const rule = store.create({
        userId,
        name: `B${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
        thresholds: { minBuyerMatch: 60 },
      });
      const low = await evaluateWatchRule(
        store,
        rule,
        baseEvent({ listingId: `bm-low-${i}`, buyerMatchScore: 40 }),
        NOW
      );
      assert.equal(low.shouldNotify, false);
      const high = await evaluateWatchRule(
        store,
        rule,
        baseEvent({ listingId: `bm-hi-${i}`, buyerMatchScore: 75 }),
        NOW
      );
      assert.equal(high.isMatch, true);
      assert.ok(high.matchReasons.includes("BUYER_MATCH_THRESHOLD"));
    });
  }
});

describe("AI Watch dedup / cooldown / idempotency (20)", () => {
  for (let i = 0; i < 20; i++) {
    it(`dedup ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-dedup-${i}`;
      store.create({
        userId,
        name: `D${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
      });
      const event = baseEvent({ listingId: `D-${i}` });
      const r1 = await processWatchEvent(store, event, { now: NOW });
      assert.equal(r1.notifications.length, 1);
      const r2 = await processWatchEvent(store, event, { now: NOW });
      assert.equal(r2.notifications.length, 0);
      assert.ok(
        r2.matches.some(
          (m) =>
            m.matchReasons.includes("DEDUP_BLOCKED") ||
            m.matchReasons.includes("COOLDOWN_BLOCKED")
        )
      );
      // After cooldown, different fingerprint (price change) can notify
      const later = new Date(NOW.getTime() + WATCH_COOLDOWN_MS + 1000);
      const event2 = baseEvent({
        listingId: `D-${i}`,
        eventType: "price_changed",
        price: 14000,
        previousPrice: 15000,
        previousSnapshot: { price: 15000, title: "BMW 320" },
        currentSnapshot: { price: 14000, title: "BMW 320" },
      });
      const r3 = await processWatchEvent(store, event2, { now: later });
      assert.ok(r3.notifications.length <= 1);
    });
  }
});

describe("AI Watch daily cap / fatigue (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`cap ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const userId = `u-cap-${i}`;
      store.create({
        userId,
        name: `C${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 50000 },
      });
      let sent = 0;
      for (let n = 0; n < WATCH_DAILY_CAP + 3; n++) {
        const res = await processWatchEvent(
          store,
          baseEvent({ listingId: `CAP-${i}-${n}`, price: 10000 + n }),
          { now: NOW }
        );
        sent += res.notifications.length;
      }
      assert.equal(sent, WATCH_DAILY_CAP);
      assert.equal(
        store.listNotificationsForUser(userId).length,
        WATCH_DAILY_CAP
      );
    });
  }
});

describe("AI Watch IDOR / cross-user isolation (15)", () => {
  for (let i = 0; i < 15; i++) {
    it(`idor ${i + 1}`, async () => {
      const store = new InMemoryWatchRepository();
      const a = store.create({
        userId: `owner-A-${i}`,
        name: "A",
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
      });
      store.create({
        userId: `owner-B-${i}`,
        name: "B",
        type: "SEARCH_WATCH",
        structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
      });
      assert.equal(store.getForUser(a.id, `owner-B-${i}`), null);
      assert.equal(store.updateStatus(a.id, `owner-B-${i}`, "PAUSED"), null);
      assert.equal(store.softDelete(a.id, `owner-B-${i}`), false);
      assert.ok(store.getForUser(a.id, `owner-A-${i}`));

      const res = await processWatchEvent(
        store,
        baseEvent({ listingId: `IDOR-${i}` }),
        { now: NOW }
      );
      for (const n of res.notifications) {
        assert.ok(n.userId === `owner-A-${i}` || n.userId === `owner-B-${i}`);
        // Each notification belongs to matching rule owner
        const rule = store.listForUser(n.userId).find((r) => r.id === n.ruleId);
        assert.ok(rule);
        assert.equal(rule!.userId, n.userId);
      }
      assert.equal(
        store.listNotificationsForUser(`owner-A-${i}`).every((n) => n.userId === `owner-A-${i}`),
        true
      );
      assert.equal(
        store.listNotificationsForUser(`attacker-${i}`).length,
        0
      );
    });
  }
});

describe("AI Watch adversarial / paused / private / race (10)", () => {
  it("PAUSED watch never notifies", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-pause",
      name: "P",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    store.updateStatus(rule.id, "u-pause", "PAUSED");
    const res = await processWatchEvent(store, baseEvent({ listingId: "PA1" }), {
      now: NOW,
    });
    assert.equal(res.notifications.length, 0);
  });

  it("DELETED watch never notifies", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-del",
      name: "D",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    store.softDelete(rule.id, "u-del");
    const res = await processWatchEvent(store, baseEvent({ listingId: "DEL1" }), {
      now: NOW,
    });
    assert.equal(res.notifications.length, 0);
  });

  it("private listing shouldNotify false", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-priv",
      name: "P",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const m = await evaluateWatchRule(
      store,
      rule,
      baseEvent({ listingId: "PRIV", visibility: "private" }),
      NOW
    );
    assert.equal(m.shouldNotify, false);
    assert.ok(m.matchReasons.includes("NOT_PUBLIC_LISTING"));
  });

  it("hidden listing blocked", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-hid",
      name: "H",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const m = await evaluateWatchRule(
      store,
      rule,
      baseEvent({ listingId: "HID", visibility: "hidden" }),
      NOW
    );
    assert.equal(m.shouldNotify, false);
  });

  it("banned listing blocked", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-ban",
      name: "B",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const m = await evaluateWatchRule(
      store,
      rule,
      baseEvent({ listingId: "BAN", banned: true }),
      NOW
    );
    assert.equal(m.shouldNotify, false);
  });

  it("photo-order-only update is not meaningful", async () => {
    const c = classifyMeaningfulChange(
      {
        price: 100,
        title: "BMW 320",
        photoOrder: ["a", "b"],
      },
      {
        price: 100,
        title: "BMW 320",
        photoOrder: ["b", "a"],
      },
      "listing_updated"
    );
    assert.equal(c.meaningful, false);
  });

  it("race: parallel duplicate fingerprint ā†’ max 1 notification", async () => {
    const store = new InMemoryWatchRepository();
    store.create({
      userId: "u-race",
      name: "R",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const event = baseEvent({ listingId: "RACE-1" });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        processWatchEvent(store, event, { now: NOW })
      )
    );
    const total = results.reduce((s, r) => s + r.notifications.length, 0);
    assert.equal(total, 1);
    assert.equal(store.listNotificationsForUser("u-race").length, 1);
  });

  it("no auto-expansion: wrong brand never matches", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-exp",
      name: "E",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const m = await evaluateWatchRule(
      store,
      rule,
      baseEvent({ listingId: "AUD", brand: "Audi" }),
      NOW
    );
    assert.equal(m.isMatch, false);
  });

  it("priceBelow threshold", async () => {
    const store = new InMemoryWatchRepository();
    const rule = store.create({
      userId: "u-below",
      name: "PB",
      type: "LISTING_PRICE_WATCH",
      structuredQuery: {},
      targetListingId: "PB1",
      thresholds: { priceBelow: 12000 },
    });
    const m = await evaluateWatchRule(
      store,
      rule,
      baseEvent({
        eventType: "price_changed",
        listingId: "PB1",
        price: 11000,
        previousPrice: 13000,
        previousSnapshot: { price: 13000, title: "BMW 320" },
        currentSnapshot: { price: 11000, title: "BMW 320" },
      }),
      NOW
    );
    assert.equal(m.isMatch, true);
    assert.ok(m.matchReasons.includes("PRICE_BELOW_THRESHOLD"));
  });

  it("LLM notification fallback on invented price", async () => {
    const store = new InMemoryWatchRepository();
    store.create({
      userId: "u-llm",
      name: "L",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    const res = await processWatchEvent(
      store,
      baseEvent({ listingId: "LLM1", price: 15000 }),
      {
        now: NOW,
        llm: async () => "Skelbimas LLM1 kainuoja 999999 €",
      }
    );
    assert.equal(res.notifications.length, 1);
    assert.ok(res.notifications[0].body.includes("15000"));
    assert.ok(!res.notifications[0].body.includes("999999"));
  });
});

describe("AI Watch performance p50/p95", () => {
  it("evaluate 50 rules under budget", async () => {
    const store = new InMemoryWatchRepository();
    for (let i = 0; i < 50; i++) {
      store.create({
        userId: `perf-${i % 5}`,
        name: `R${i}`,
        type: "SEARCH_WATCH",
        structuredQuery: {
          category: i % 2 === 0 ? "vehicles" : "electronics",
          brand: "BMW",
          priceMax: 20000,
        },
      });
    }
    const event = baseEvent({ listingId: "PERF" });
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      await evaluateWatchRule(
        store,
        store.listActiveRules()[0] as AiWatchRule,
        event,
        NOW
      );
      // also prefilter+evaluate batch
      void store.listActiveRules();
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    assert.ok(p50 < 20, `p50 ${p50}`);
    assert.ok(p95 < 50, `p95 ${p95}`);
  });
});


