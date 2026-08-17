import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { FACET_NUMERIC_CAST_FIXTURES, FACET_RESULT_FIXTURES } from "./facet-fixtures.ts";
import {
  activeFacetCount,
  applyFacetFilters,
  buildFacetSqlPlan,
  canonicalizeFacetSearchParams,
  clearVerticalFacets,
  filterableKeysForVertical,
  jsonNumericAttrExpr,
  paginateFacetListings,
  parseFacetSearchParams,
  resetFacetPage,
  serializeFacetSearchParams,
  sortFacetListings,
} from "./facet-query.ts";
import { getFilterableAttributes } from "./queries.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Stage 13B faceted search domain", () => {
  it("A — dynamic filter generation matches 13A filterable keys", () => {
    const nt = filterableKeysForVertical("REAL_ESTATE");
    assert.ok(nt.includes("rooms"));
    assert.ok(nt.includes("area"));
    assert.equal(nt.includes("vin"), false);
    assert.equal(nt.includes("mileage"), false);
    assert.equal(nt.includes("fuelType"), false);

    const electronics = filterableKeysForVertical("ELECTRONICS");
    assert.ok(electronics.includes("condition"));
    assert.equal(electronics.includes("rooms"), false);
    assert.equal(electronics.includes("salaryMin"), false);
    assert.equal(electronics.includes("vin"), false);

    const jobs = filterableKeysForVertical("JOBS");
    assert.ok(jobs.includes("jobTitle"));
    assert.equal(jobs.includes("mileage"), false);
    assert.equal(jobs.includes("vin"), false);

    const transport = filterableKeysForVertical("TRANSPORT");
    assert.ok(transport.includes("mileage"));
    assert.equal(transport.includes("salaryMin"), false);
    assert.equal(transport.includes("rooms"), false);
    assert.equal(
      transport.includes("vin"),
      getFilterableAttributes("TRANSPORT").some((a) => a.key === "vin")
    );
  });

  it("B — URL two-way synchronization is deterministic", () => {
    const parsed = parseFacetSearchParams(
      "vertical=real_estate&rooms=2&area_min=45&sort=newest&q=butas"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const round = parseFacetSearchParams(serializeFacetSearchParams(parsed.query));
    assert.equal(round.ok, true);
    if (!round.ok) return;
    assert.equal(round.query.verticalId, "REAL_ESTATE");
    assert.equal(round.query.q, "butas");
    assert.equal(round.query.sort, "newest");
    assert.deepEqual(
      round.query.predicates.map((p) => [p.kind, p.key]),
      parsed.query.predicates.map((p) => [p.kind, p.key])
    );
  });

  it("C — incompatible facets are stripped when vertical changes", () => {
    const transport = parseFacetSearchParams(
      "vertical=transport&mileage_max=100000&fuelType=Dyzelinas"
    );
    assert.equal(transport.ok, true);
    if (!transport.ok) return;
    const cleared = clearVerticalFacets({
      ...transport.query,
      verticalId: "JOBS",
    });
    assert.equal(cleared.predicates.length, 0);
    assert.equal(cleared.page, 1);
    assert.equal(cleared.verticalId, "JOBS");
    const jobsWithMileage = parseFacetSearchParams(
      "vertical=jobs&mileage=100000"
    );
    assert.equal(jobsWithMileage.ok, false);
  });

  it("E — frozen 11J boundary for 13B sources", () => {
    const files = [
      "shared/marketplace-domain/facet-query.ts",
      "shared/marketplace-domain/facet-fixtures.ts",
      "src/components/marketplace/FacetFilterPanel.tsx",
      "src/hooks/useCanonicalFacetUrl.ts",
      "server/src/marketplace/facet-http.ts",
    ];
    for (const rel of files) {
      assert.equal(rel.startsWith("server/src/payments/"), false);
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) continue;
      const src = readFileSync(abs, "utf8");
      assert.equal(/server\/src\/payments/.test(src), false);
      assert.equal(/\b(058|059|060|061)\b/.test(src), false);
    }
  });

  it("F — JOBS + mileage is not a valid Jobs query", () => {
    const parsed = parseFacetSearchParams("vertical=jobs&mileage=100000");
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.ok(parsed.issues.some((i) => i.key === "mileage" && i.code === "unknown_facet"));
  });

  it("G — result correctness on fixtures", () => {
    const rooms = parseFacetSearchParams("vertical=real_estate&rooms=2");
    assert.equal(rooms.ok, true);
    if (!rooms.ok) return;
    const nt = applyFacetFilters(FACET_RESULT_FIXTURES, rooms.query).map((l) => l.id);
    assert.deepEqual(nt.sort(), ["nt-a", "nt-c"]);

    const used = parseFacetSearchParams("vertical=electronics&condition=Naudotas");
    assert.equal(used.ok, true);
    if (!used.ok) return;
    const els = applyFacetFilters(FACET_RESULT_FIXTURES, used.query).map((l) => l.id);
    assert.deepEqual(els, ["el-used"]);
    assert.equal(els.includes("el-new"), false);

    const mileage = parseFacetSearchParams("vertical=transport&mileage_max=100000");
    assert.equal(mileage.ok, true);
    if (!mileage.ok) return;
    const cars = applyFacetFilters(FACET_RESULT_FIXTURES, mileage.query).map((l) => l.id);
    assert.deepEqual(cars, ["tr-low"]);
    assert.equal(cars.includes("tr-high"), false);
  });

  it("H — invalid range / enum / NaN fail-closed", () => {
    const range = parseFacetSearchParams("vertical=real_estate&area_min=100&area_max=20");
    assert.equal(range.ok, false);
    if (!range.ok) {
      assert.ok(range.issues.some((i) => i.code === "range_order"));
    }

    const negative = parseFacetSearchParams("vertical=transport&mileage_max=-1");
    assert.equal(negative.ok, false);
    if (!negative.ok) {
      assert.ok(negative.issues.some((i) => i.code === "min"));
    }

    const nan = parseFacetSearchParams("vertical=jobs&salaryMin=abc");
    assert.equal(nan.ok, false);
    if (!nan.ok) {
      assert.ok(nan.issues.some((i) => i.code === "invalid_type"));
    }

    const absurd = parseFacetSearchParams("vertical=transport&year_min=999999999");
    assert.equal(absurd.ok, false);
    if (!absurd.ok) {
      assert.ok(absurd.issues.some((i) => i.code === "max"));
    }

    const hacked = parseFacetSearchParams("vertical=electronics&condition=HACKED");
    assert.equal(hacked.ok, false);
    if (!hacked.ok) {
      assert.ok(hacked.issues.some((i) => i.code === "invalid_enum"));
    }

    const used = parseFacetSearchParams("vertical=electronics&condition=USED");
    assert.equal(used.ok, false);
  });

  it("I — query injection cannot become SQL identifiers", () => {
    const parsed = parseFacetSearchParams(
      "vertical=jobs&mileage=1%3BDROP&sort=created_at%3BDROP%20TABLE"
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.ok(parsed.issues.some((i) => i.code === "unknown_facet" || i.code === "invalid_sort"));
    }
    const ok = parseFacetSearchParams("vertical=transport&mileage_max=100000&sort=newest");
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const plan = buildFacetSqlPlan(ok.query);
    assert.equal(/ORDER BY created_at DESC/.test(plan.text), true);
    assert.equal(/ORDER BY \$/.test(plan.text), false);
    assert.equal(/mileage/.test(plan.text), false);
    assert.equal(plan.sortSql, "created_at DESC");
    assert.ok(plan.params.includes("mileage"));
    assert.equal(plan.text.includes("DROP"), false);
  });

  it("J — deep-link parse is deterministic", () => {
    const a = parseFacetSearchParams("vertical=electronics&condition=Naudotas");
    const b = parseFacetSearchParams("vertical=electronics&condition=Naudotas");
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
    if (!a.ok) return;
    const ids = applyFacetFilters(FACET_RESULT_FIXTURES, a.query).map((l) => l.id);
    assert.deepEqual(ids, ["el-used"]);
  });

  it("K — pagination resets on filter change helper", () => {
    const parsed = parseFacetSearchParams("vertical=real_estate&rooms=2&page=4");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.query.page, 4);
    const reset = resetFacetPage(parsed.query);
    assert.equal(reset.page, 1);
    const paged = paginateFacetListings(
      applyFacetFilters(FACET_RESULT_FIXTURES, reset),
      4,
      1
    );
    assert.equal(paged.page <= paged.pageCount, true);
    assert.ok(paged.items.length <= 1);
  });

  it("L — one bounded plan, no N+1 pattern", () => {
    const parsed = parseFacetSearchParams(
      "vertical=real_estate&rooms=2&area_min=45&sort=price_asc"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const plan = buildFacetSqlPlan(parsed.query);
    const selectCount = (plan.text.match(/SELECT /gi) ?? []).length;
    assert.equal(selectCount, 1);
    assert.match(plan.text, /LIMIT \$/);
    assert.match(plan.text, /OFFSET \$/);
    assert.equal(plan.text.includes("FOR EACH"), false);
    assert.ok(activeFacetCount(parsed.query) >= 2);
    const sorted = sortFacetListings(
      applyFacetFilters(FACET_RESULT_FIXTURES, parsed.query),
      parsed.query.sort
    );
    assert.ok(sorted.every((l) => l.category === "real_estate"));
  });

  it("search text AND facets (12B coexistence)", () => {
    const parsed = parseFacetSearchParams(
      "vertical=real_estate&q=Vilnius&rooms=2&area_min=45"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const ids = applyFacetFilters(FACET_RESULT_FIXTURES, parsed.query).map((l) => l.id);
    assert.deepEqual(ids, ["nt-a"]);
  });

  it("O — boundary normalization trims location at serialize/parse", () => {
    const parsed = parseFacetSearchParams("vertical=real_estate&location=%20%20Vilnius%20%20");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const loc = parsed.query.predicates.find((p) => p.kind === "location");
    assert.equal(loc && loc.kind === "location" ? loc.value : "", "Vilnius");
    const round = serializeFacetSearchParams({
      ...parsed.query,
      predicates: [{ kind: "location", key: "location", value: "  Vilnius  " }],
    });
    assert.equal(round.get("location"), "Vilnius");
    assert.equal(round.get("location")?.startsWith(" "), false);
  });

  it("P — invalid vertical is fail-closed and not kept as URL authority", () => {
    const parsed = parseFacetSearchParams("vertical=hacked&mileage_max=100");
    assert.equal(parsed.ok, false);
    const cleaned = canonicalizeFacetSearchParams("vertical=hacked&mileage_max=100");
    assert.equal(cleaned.get("vertical"), null);
    assert.equal(cleaned.has("vertical"), false);
    assert.equal(cleaned.get("mileage_max"), null);
    assert.equal(cleaned.has("mileage_max"), false);
    const reparsed = parseFacetSearchParams(cleaned);
    assert.equal(reparsed.ok, true);
    if (!reparsed.ok) return;
    assert.equal(reparsed.query.verticalId, null);
    assert.equal(reparsed.query.predicates.length, 0);
  });

  it("Q — malformed numeric attribute is a non-match, not an error", () => {
    const parsed = parseFacetSearchParams("vertical=transport&mileage_max=100000");
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const ids = applyFacetFilters(FACET_NUMERIC_CAST_FIXTURES, parsed.query).map(
      (l) => l.id
    );
    assert.deepEqual(ids, ["tr-numeric-ok"]);
    assert.equal(ids.includes("tr-malformed"), false);
    const plan = buildFacetSqlPlan(parsed.query);
    assert.match(plan.text, /CASE WHEN/);
    assert.equal(plan.text.includes("NULLIF(attributes->>"), false);
    const expr = jsonNumericAttrExpr(1);
    assert.match(expr, /ELSE NULL/);
    assert.equal(expr.includes("ORDER BY"), false);
  });
});
