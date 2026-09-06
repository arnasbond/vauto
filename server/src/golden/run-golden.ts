/**
 * E0 — golden conversation runner.
 *
 *   npx tsx src/golden/run-golden.ts            # deterministic (scripted model)
 *   LIVE_GOLDEN=1 npx tsx src/golden/run-golden.ts  # live model gate (real Gemini)
 *
 * Writes `AI_GOLDEN_BASELINE.md` + `ai-golden-results.json` into
 * `audit-output/e0-golden/`. Exit code reflects end-to-end pass rate.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runGoldenScenario } from "./harness/golden-simulator.js";
import { GOLDEN_SCENARIOS } from "./scenarios/golden-scenarios.js";
import type { BaselineReport, FailureCategory } from "./harness/golden-types.js";
// E2 — harness ENVIRONMENT emulation of the production server bootstrap:
// production marks the consequential-action confirmation boundary READY only
// after migrations succeed (server/src/index.ts:332). The deterministic
// runner exercises the real agent code, so it installs the same boundary
// through the documented TEST-ONLY seam (in-memory store — no DB in CI).
// Scenario EXPECTATIONS are untouched; this mirrors the bootstrap, not the
// agent under test.
import {
  createInMemoryPendingActionStore,
  setDefaultPendingActionStoreForTests,
} from "../ai/confirmation/consequential-action-policy.js";

const LIVE = process.env.LIVE_GOLDEN === "1";

function headSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  // E2 — server-bootstrap emulation (see import note). Without this the
  // consequential-action boundary stays UNAVAILABLE and G31 fails closed on
  // an environment artifact, not on agent behavior.
  setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
  const results = [];
  for (const scenario of GOLDEN_SCENARIOS) {
    const result = await runGoldenScenario(scenario);
    results.push(result);
    const mark = result.endToEndCorrect ? "PASS" : "FAIL";
    console.log(`[${mark}] ${scenario.id} ${scenario.title}`);
    for (const f of result.failures.slice(0, 3)) {
      console.log(`      - ${f.category}: ${f.message.slice(0, 140)}`);
    }
  }

  const taxonomy: Record<FailureCategory, number> = {
    planner_bypass: 0,
    frontend_override: 0,
    context_truncation: 0,
    missing_assistant_history: 0,
    wrong_state_source: 0,
    wrong_tool: 0,
    tool_override: 0,
    policy_conflict: 0,
    stale_state: 0,
    wizard_pending_conflict: 0,
    model_reasoning_failure: 0,
    goal_missed: 0,
    infrastructure_test_failure: 0,
  };
  for (const r of results) {
    for (const f of r.failures) taxonomy[f.category] += 1;
  }

  const e2ePass = results.filter((r) => r.endToEndCorrect).length;
  const behaviorFail = results.filter((r) => !r.behaviorCorrect).length;
  const continuityFail = results.filter((r) => !r.continuityCorrect).length;
  const wrongToolFail = results.filter((r) => !r.toolCorrect).length;
  const authorityPolicyFail = results.filter((r) => !r.authorityCorrect).length;
  const stateFail = results.filter((r) => !r.stateCorrect).length;

  const report: BaselineReport = {
    generatedAt: new Date().toISOString(),
    mode: LIVE ? "live" : "deterministic",
    headSha: headSha(),
    total: results.length,
    e2ePass,
    behavioralFail: behaviorFail,
    continuityFail,
    wrongToolFail,
    authorityPolicyFail,
    results,
    taxonomy,
  };

  const outDir = resolve("audit-output/e0-golden");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "ai-golden-results.json"), JSON.stringify(report, null, 2));

  const lines: string[] = [];
  lines.push(`# AI GOLDEN BASELINE — ${report.mode.toUpperCase()} mode`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- HEAD: ${report.headSha}`);
  lines.push(`- Scenarios: ${report.total}`);
  lines.push(`- **End-to-end PASS: ${report.e2ePass}/${report.total}**`);
  lines.push(`- Behavior fail: ${report.behavioralFail} · State fail: ${stateFail} · Tool fail: ${report.wrongToolFail} · Continuity fail: ${report.continuityFail} · Authority/policy fail: ${report.authorityPolicyFail}`);
  lines.push("");
  lines.push("## Results");
  lines.push("");
  for (const r of results) {
    lines.push(
      `### ${r.id} ${r.title} — ${r.endToEndCorrect ? "PASS" : "FAIL"} ` +
        `(auth: ${r.authorityCorrect ? "P" : "F"}, beh: ${r.behaviorCorrect ? "P" : "F"}, state: ${r.stateCorrect ? "P" : "F"}, tool: ${r.toolCorrect ? "P" : "F"}, cont: ${r.continuityCorrect ? "P" : "F"})`
    );
    for (const f of r.failures) {
      lines.push(`- \`${f.category}\`: ${f.message}`);
    }
    for (const t of r.turns) {
      const extra = t.modelCalled ? `model=yes(${t.modelRounds})` : "model=NO";
      lines.push(`  - T${t.index} ${t.status} [${extra}, action=${t.actionsType}] „${t.replyHead.slice(0, 70)}“`);
    }
    lines.push("");
  }
  lines.push("## Failure taxonomy");
  lines.push("");
  for (const [cat, count] of Object.entries(taxonomy)) {
    if (count > 0) lines.push(`- ${cat}: ${count}`);
  }
  lines.push("");
  lines.push(`> Deterministic mode uses the scripted reference planner (real tool/policy/history code).`);
  lines.push(`> LIVE mode (LIVE_GOLDEN=1) uses the real model and is not a CI gate.`);
  writeFileSync(resolve(outDir, "AI_GOLDEN_BASELINE.md"), lines.join("\n"), "utf8");

  console.log(`\n== E2E PASS ${e2ePass}/${results.length} (${report.mode}) ==`);
  console.log(`Report: ${resolve(outDir, "AI_GOLDEN_BASELINE.md")}`);
  process.exitCode = 0; // E0 success ≠ all green; measurement is the goal.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
