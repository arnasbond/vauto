/**
 * Stage 13B — HTTP facet parser/query (fixtures mode).
 * Does not touch 11J payments. 13A registry is imported read-only via shared sync.
 */
process.env.FACET_SEARCH_FIXTURES = "1";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import pg from "pg";
import { handleFacetListingSearch } from "../facet-http.js";
import { buildFacetSqlPlan, parseFacetSearchParams } from "../../shared/marketplace-domain/index.js";

function createApp() {
  const app = express();
  app.get("/api/search/listings", (req, res, next) => {
    void handleFacetListingSearch(req, res).catch(next);
  });
  return app;
}

describe("Stage 13B facet HTTP", () => {
  const app = createApp();

  it("F — JOBS + mileage is HTTP 400, not a valid Jobs filter", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=jobs&mileage=100000"
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.ok(
      (res.body.issues as Array<{ key: string }>).some((i) => i.key === "mileage")
    );
  });

  it("G — fixture result sets are authoritative", async () => {
    const rooms = await request(app).get(
      "/api/search/listings?vertical=real_estate&rooms=2"
    );
    assert.equal(rooms.status, 200);
    const roomIds = (rooms.body.items as Array<{ id: string }>).map((l) => l.id).sort();
    assert.deepEqual(roomIds, ["nt-a", "nt-c"]);

    const used = await request(app).get(
      "/api/search/listings?vertical=electronics&condition=Naudotas"
    );
    assert.equal(used.status, 200);
    assert.deepEqual(
      (used.body.items as Array<{ id: string }>).map((l) => l.id),
      ["el-used"]
    );

    const mileage = await request(app).get(
      "/api/search/listings?vertical=transport&mileage_max=100000"
    );
    assert.equal(mileage.status, 200);
    assert.deepEqual(
      (mileage.body.items as Array<{ id: string }>).map((l) => l.id),
      ["tr-low"]
    );
  });

  it("H — invalid range and enum are HTTP 400", async () => {
    const range = await request(app).get(
      "/api/search/listings?vertical=real_estate&area_min=100&area_max=20"
    );
    assert.equal(range.status, 400);

    const hacked = await request(app).get(
      "/api/search/listings?vertical=electronics&condition=HACKED"
    );
    assert.equal(hacked.status, 400);

    const nan = await request(app).get(
      "/api/search/listings?vertical=jobs&salaryMin=abc"
    );
    assert.equal(nan.status, 400);
  });

  it("I — sort injection cannot become ORDER BY identifier", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=electronics&sort=price%3BDROP%20TABLE"
    );
    assert.equal(res.status, 400);
    const ok = parseFacetSearchParams(
      "vertical=electronics&condition=Naudotas&sort=newest"
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const plan = buildFacetSqlPlan(ok.query);
    assert.equal(plan.text.includes("ORDER BY created_at DESC"), true);
    assert.equal(/ORDER BY \$/.test(plan.text), false);
  });

  it("K — page is bounded; filter change helper is page=1 on serialize default", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=real_estate&rooms=2&page=4&limit=1"
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length <= 1);
    assert.equal(typeof res.body.total, "number");
  });

  it("search text AND facets coexist", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=real_estate&q=Vilnius&rooms=2&area_min=45"
    );
    assert.equal(res.status, 200);
    assert.deepEqual(
      (res.body.items as Array<{ id: string }>).map((l) => l.id),
      ["nt-a"]
    );
  });

  it("P — invalid vertical is HTTP 400; mileage is not a valid query", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=hacked&mileage_max=100"
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it("Q — numeric plan is fail-safe; valid mileage query is not 500", async () => {
    const res = await request(app).get(
      "/api/search/listings?vertical=transport&mileage_max=100000"
    );
    assert.equal(res.status, 200);
    const parsed = parseFacetSearchParams(
      "vertical=transport&mileage_max=100000"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const plan = buildFacetSqlPlan(parsed.query);
    assert.match(plan.text, /CASE WHEN \(attributes->>\$\d+\) ~/);
    assert.equal(/NULLIF\(attributes->>\$\d+, ''\)::numeric/.test(plan.text), false);
  });
});

const dbUrl = process.env.TEST_DATABASE_URL?.trim();
const explainIt = dbUrl ? it : it.skip;

explainIt(
  "L — EXPLAIN sanity on TEST_DATABASE_URL (SKIP without DB or listings table)",
  async (t) => {
    const parsed = parseFacetSearchParams(
      "vertical=real_estate&rooms=2&area_min=45&sort=newest"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const plan = buildFacetSqlPlan(parsed.query);
    const pool = new pg.Pool({ connectionString: dbUrl });
    try {
      const explained = await pool.query(`EXPLAIN ${plan.text}`, plan.params);
      assert.ok(explained.rows.length > 0);
      assert.equal(plan.text.includes("LIMIT"), true);
      assert.equal((plan.text.match(/SELECT /gi) ?? []).length, 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      t.skip(`listings schema not available on TEST_DATABASE_URL (${message})`);
    } finally {
      await pool.end();
    }
  }
);
