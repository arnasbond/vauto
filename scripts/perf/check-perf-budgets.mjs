/**
 * F8 Performance Budgets — before/after verification.
 *
 * Budgets are DERIVED from the measured baseline (docs/perf/f8-baseline.json),
 * not arbitrary numbers:
 *   - image bytes on the throttled home page must IMPROVE by ≥ 30%;
 *   - LCP must not regress more than +5% (slow-4g scenarios);
 *   - CLS must not regress more than +0.01;
 *   - JS bytes must not grow more than +2%.
 *
 * Usage: node scripts/perf/check-perf-budgets.mjs [baseline] [after]
 */
import { readFileSync } from "node:fs";

const baselineFile = process.argv[2] ?? "docs/perf/f8-baseline.json";
const afterFile = process.argv[3] ?? "docs/perf/f8-after.json";

const baseline = JSON.parse(readFileSync(baselineFile, "utf8")).results;
const after = JSON.parse(readFileSync(afterFile, "utf8")).results;

let failures = 0;
const check = (cond, label, detail) => {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL ${label} — ${detail}`);
  }
};

const IMAGE_WIN_MIN = 0.3; // ≥30% fewer image bytes
const LCP_REGRESSION_MAX = 1.05; // +5%
const CLS_REGRESSION_MAX = 0.01;
const JS_GROWTH_MAX = 1.02; // +2%

for (const id of Object.keys(baseline)) {
  const b = baseline[id];
  const a = after[id];
  if (!a) {
    check(false, `${id} exists in the after run`, "missing scenario");
    continue;
  }
  if (b.imgBytes > 0) {
    const win = (b.imgBytes - a.imgBytes) / b.imgBytes;
    check(
      win >= IMAGE_WIN_MIN,
      `${id}: image bytes improved by ≥30%`,
      `before=${b.imgBytes} after=${a.imgBytes} (${(win * 100).toFixed(1)}%)`
    );
  }
  if (typeof b.lcp === "number" && typeof a.lcp === "number" && b.lcp > 0) {
    const growth = a.lcp / b.lcp;
    check(
      growth <= LCP_REGRESSION_MAX,
      `${id}: LCP not regressed >5%`,
      `before=${Math.round(b.lcp)}ms after=${Math.round(a.lcp)}ms (${(growth * 100).toFixed(1)}%)`
    );
  }
  if (typeof b.cls === "number" && typeof a.cls === "number") {
    check(
      a.cls - b.cls <= CLS_REGRESSION_MAX,
      `${id}: CLS not regressed >0.01`,
      `before=${b.cls.toFixed(4)} after=${a.cls.toFixed(4)}`
    );
  }
  if (b.jsBytes > 0) {
    check(
      a.jsBytes / b.jsBytes <= JS_GROWTH_MAX,
      `${id}: JS bytes not grown >2%`,
      `before=${b.jsBytes} after=${a.jsBytes}`
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} performance budgets FAILED.`);
  process.exit(1);
}
console.log("\nAll performance budgets passed.");
