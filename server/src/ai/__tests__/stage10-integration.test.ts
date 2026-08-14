/**
 * Stage 10J — real PostgreSQL integration (PGlite = embedded Postgres) + E2E chain.
 * Proves IDOR ownership, fingerprint unique race, and production repository path.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  createAiWatchRepository,
  processWatchEvent,
  type WatchListingEvent,
} from "../../ai-watch/index.js";
import { classifyIntent } from "../intent/index.js";
import { runNaturalLanguageSearch } from "../search/nl-search-engine.js";
import { computeValuation } from "../../market-intelligence/index.js";
import { computeVautoScore } from "../../vauto-score/index.js";
import { runBuyerMatch } from "../../buyer-match/index.js";
import { compareListingsSync, criticalCompareHash } from "../../compare-engine/index.js";
import {
  resolveAndValidateOutboundUrl,
  isBlockedIpLiteral,
  hardenOutboundUrl,
} from "../../shared/url-ssrf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../../../migrations/036_ai_watch_1.0.sql"
);

type PgLiteQueryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

function adaptPglite(db: PGlite): PgLiteQueryable {
  return {
    async query(text, params = []) {
      // PGlite uses $1 style same as node-pg
      const res = await db.query(text, params as never[]);
      return { rows: (res.rows ?? []) as never[], rowCount: res.affectedRows ?? null };
    },
  };
}

describe("10J Stage10 PostgreSQL integration", () => {
  let db: PGlite;
  let q: PgLiteQueryable;

  before(async () => {
    db = new PGlite();
    // Minimal users table for FK (mirrors production users.id)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 't',
        phone TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT ''
      );
    `);
    const sql = readFileSync(migrationPath, "utf8");
    await db.exec(sql);
    q = adaptPglite(db);
    await q.query(
      `INSERT INTO users (id, name, phone, city) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
      ["user-a", "A", "1", "Vilnius", "user-b", "B", "2", "Kaunas"]
    );
  });

  after(async () => {
    await db?.close();
  });

  it("IDOR: attacker cannot read/update/delete owner watch", async () => {
    const repo = createAiWatchRepository(q as never);
    const rule = await repo.create({
      userId: "user-a",
      name: "BMW watch",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    assert.equal(await repo.getForUser(rule.id, "user-b"), null);
    assert.equal(await repo.updateStatus(rule.id, "user-b", "PAUSED"), null);
    assert.equal(await repo.softDelete(rule.id, "user-b"), false);
    const owned = await repo.getForUser(rule.id, "user-a");
    assert.ok(owned);
    assert.equal(owned!.status, "ACTIVE");
  });

  it("race: 12 parallel notify inserts → exactly 1 notification row", async () => {
    // Isolate from other tests' rules
    await q.query(`DELETE FROM ai_watch_notifications`);
    await q.query(`DELETE FROM ai_watches`);
    const repo = createAiWatchRepository(q as never);
    const rule = await repo.create({
      userId: "user-a",
      name: "race",
      type: "SEARCH_WATCH",
      structuredQuery: {
        category: "vehicles",
        brand: "RACEBRAND",
        priceMax: 25000,
      },
    });
    const event: WatchListingEvent = {
      eventType: "listing_created",
      listingId: "L-race-1",
      category: "vehicles",
      title: "Race Car",
      price: 18000,
      brand: "RACEBRAND",
      model: "X",
      year: 2019,
      distanceKm: 10,
      status: "active",
      visibility: "public",
      banned: false,
      occurredAt: new Date().toISOString(),
      currentSnapshot: {
        price: 18000,
        title: "Race Car",
        status: "active",
        visibility: "public",
        brand: "RACEBRAND",
        model: "X",
        year: 2019,
      },
    };

    const results = await Promise.all(
      Array.from({ length: 12 }, () => processWatchEvent(repo, event))
    );
    const inserted = results.reduce((n, r) => n + r.notifications.length, 0);
    assert.equal(inserted, 1);
    assert.equal(results.flatMap((r) => r.notifications).every((n) => n.ruleId === rule.id), true);

    const countRes = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM ai_watch_notifications
       WHERE user_id = $1 AND listing_id = $2`,
      ["user-a", "L-race-1"]
    );
    assert.equal(Number(countRes.rows[0].c), 1);
  });

  it("SSRF: DNS private IP + static host blocked", async () => {
    assert.equal(hardenOutboundUrl("http://127.0.0.1/x").ok, false);
    assert.equal(hardenOutboundUrl("http://169.254.169.254/latest").ok, false);
    assert.equal(isBlockedIpLiteral("10.0.0.5"), true);
    assert.equal(isBlockedIpLiteral("8.8.8.8"), false);
    const local = await resolveAndValidateOutboundUrl("http://127.0.0.1/");
    assert.equal(local.ok, false);
  });

  it("E2E chain: Intent→Search→Valuation→Score→Match→Compare→Watch→Event→DB notif", async () => {
    const repo = createAiWatchRepository(q as never);
    const intent = await classifyIntent({
      text: "ieškau BMW 320 iki 20000",
      llmCaller: null,
    });
    assert.ok(["SEARCH", "BUY"].includes(intent.intent));

    const listingId = "L-e2e-1";
    const search = await runNaturalLanguageSearch({
      text: "BMW 320 iki 20000",
      catalog: {
        loadCandidates: async () => [
          {
            id: listingId,
            title: "BMW 320",
            price: 17500,
            location: "Vilnius",
            category: "vehicles",
            brand: "BMW",
            model: "320",
            year: 2018,
            distanceKm: 12,
            createdAt: new Date().toISOString(),
            status: "active",
            visibility: "public",
          },
        ],
      },
      llmCaller: null,
    });
    assert.ok(search.candidateIds.includes(listingId));
    assert.ok(!search.candidateIds.includes("hallucinated"));

    const valuation = computeValuation({
      subject: {
        category: "vehicles",
        brand: "BMW",
        model: "320",
        year: 2018,
        location: "Vilnius",
      },
      observations: Array.from({ length: 8 }, (_, i) => ({
        id: `obs-${i}`,
        category: "vehicles",
        brand: "BMW",
        model: "320",
        year: 2018,
        location: "Vilnius",
        price: 17000 + i * 100,
        priceSource: "ASKING_PRICE" as const,
        observedAt: new Date().toISOString(),
      })),
      now: new Date(),
    });
    assert.equal(valuation.status, "AVAILABLE");

    const score = computeVautoScore({
      askingPrice: 17500,
      marketValuation: valuation,
      listing: {
        photoCount: 5,
        descriptionLength: 200,
        titleLength: 20,
        presentAttributeKeys: ["brand", "model", "year"],
        expectedAttributeKeys: ["brand", "model", "year"],
      },
      seller: {
        identityVerified: true,
        accountAgeDays: 400,
        completedTransactions: 3,
      },
      calculatedAt: new Date().toISOString(),
    });
    assert.ok(score.totalScore == null || score.totalScore >= 0);

    const match = runBuyerMatch({
      request: {
        searchQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
        preferences: {},
        candidateListingIds: [listingId],
      },
      listings: [
        {
          id: listingId,
          title: "BMW 320",
          price: 17500,
          location: "Vilnius",
          category: "vehicles",
          brand: "BMW",
          model: "320",
          year: 2018,
          distanceKm: 12,
        },
      ],
    });
    assert.ok(match.rankedListings.some((r) => r.listingId === listingId));

    const a = {
      id: listingId,
      title: "BMW 320",
      category: "vehicles",
      price: 17500,
      updatedAt: new Date().toISOString(),
      visibility: "public" as const,
      status: "active",
      brand: "BMW",
      model: "320",
      year: 2018,
      distanceKm: 12,
      priceSnapshot: 17500,
      criticalHash: "",
    };
    a.criticalHash = criticalCompareHash(a);
    const b = {
      ...a,
      id: "L-e2e-2",
      price: 18200,
      priceSnapshot: 18200,
      year: 2019,
    };
    b.criticalHash = criticalCompareHash(b);
    const cmp = compareListingsSync(
      { listingIds: [a.id, b.id] },
      [a, b],
      new Date().toISOString()
    );
    assert.equal(cmp.status, "AVAILABLE");

    const watch = await repo.create({
      userId: "user-a",
      name: "e2e",
      type: "SEARCH_WATCH",
      structuredQuery: { category: "vehicles", brand: "BMW", priceMax: 20000 },
    });
    assert.equal(watch.userId, "user-a");

    const event: WatchListingEvent = {
      eventType: "listing_created",
      listingId,
      category: "vehicles",
      title: "BMW 320",
      price: 17500,
      brand: "BMW",
      model: "320",
      year: 2018,
      distanceKm: 12,
      status: "active",
      visibility: "public",
      occurredAt: new Date().toISOString(),
      currentSnapshot: {
        price: 17500,
        title: "BMW 320",
        status: "active",
        visibility: "public",
        brand: "BMW",
        year: 2018,
      },
    };
    const processed = await processWatchEvent(repo, event);
    assert.ok(processed.notifications.length >= 1);
    const notifs = await repo.listNotificationsForUser("user-a");
    assert.ok(notifs.some((n) => n.listingId === listingId && n.ruleId === watch.id));
  });
});
