/**
 * F8 Performance Budgets — CLI (fail-closed).
 *
 * Usage: node scripts/perf/check-perf-budgets.mjs [baseline] [after]
 * Exit codes: 0 = all gates passed (warnings allowed), 1 = FAIL (any gate
 * or any evidence-structure violation), 2 = unreadable/invalid JSON.
 */
import { readFileSync } from "node:fs";
import { checkBudgets } from "./budgets-core.mjs";

const baselineFile = process.argv[2] ?? "docs/perf/f8-baseline.json";
const afterFile = process.argv[3] ?? "docs/perf/f8-after.json";

let baseline;
let after;
try {
  baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
} catch (err) {
  console.error(`ERROR: cannot read baseline ${baselineFile}: ${err.message}`);
  process.exit(2);
}
try {
  after = JSON.parse(readFileSync(afterFile, "utf8"));
} catch (err) {
  console.error(`ERROR: cannot read after run ${afterFile}: ${err.message}`);
  process.exit(2);
}

const { failures, warnings } = checkBudgets(baseline, after, console);

if (failures > 0) {
  console.error(`\n${failures} performance budgets FAILED.`);
  process.exit(1);
}
console.log(`\nAll performance budgets passed (${warnings} warnings).`);
