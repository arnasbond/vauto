/**
 * REAL-MODEL EVALUATION RUNNER — manual / workflow_dispatch only.
 *
 *   npx tsx src/real-model-eval/run.ts
 *   REAL_MODEL_EVAL_LIMIT=8 npx tsx src/real-model-eval/run.ts
 *
 * Requires GEMINI_API_KEY (the real configured model). WITHOUT it the runner
 * writes a "NOT RUN" report and exits 2 — it never fabricates a result.
 *
 * Runs each conversation through the real production Agent Core path (see
 * ./harness.ts) and writes machine + human-readable results under
 * `server/audit-output/real-model-eval/`. No secret, token, or credential is
 * ever written or logged.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

import {
  REAL_MODEL_EVAL_CASES,
  countEvalCases,
} from "./dataset.js";
import {
  createEvalApp,
  installRealModelSeams,
  runEvalCase,
} from "./harness.js";
import { scoreCase, type CaseScore, type FailureClass } from "./scorer.js";

const OUT_DIR = resolve("audit-output/real-model-eval");

function headSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readLimit(): number {
  const raw = (process.env.REAL_MODEL_EVAL_LIMIT ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : countEvalCases();
}

function notRun(): void {
  const report = [
    "# REAL-MODEL EVALUATION — NOT RUN",
    "",
    "- Reason: GEMINI_API_KEY not available in this environment.",
    "- The deterministic/offline harness self-test remains the CI measure.",
    "- To run: `GEMINI_API_KEY=<secret> npx tsx src/real-model-eval/run.ts` (manual only).",
    "",
  ].join("\n");
  console.log(report);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "real-model-eval-report.md"), report, "utf8");
  writeFileSync(
    resolve(OUT_DIR, "real-model-eval-results.json"),
    JSON.stringify({ status: "NOT_RUN", reason: "no_key" }, null, 2),
    "utf8"
  );
  process.exitCode = 2;
}

async function main(): Promise<void> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    notRun();
    return;
  }

  installRealModelSeams();
  const app = createEvalApp();

  const limit = readLimit();
  const cases = REAL_MODEL_EVAL_CASES.slice(0, limit);
  const scores: CaseScore[] = [];
  let requestCount = 0;

  for (const c of cases) {
    try {
      const outcome = await runEvalCase(app, c);
      requestCount += outcome.turns.length;
      const sc = scoreCase(c, outcome.turns, outcome.modelsUsed);
      scores.push(sc);
      const mark = sc.failureClasses.length === 0 ? "PASS" : "FAIL";
      console.log(`[${mark}] ${sc.caseId} ${sc.title} (${sc.total}/${sc.maxTotal})`);
      for (const t of sc.turns) {
        if (t.flags.length) console.log(`      T${t.index} flags=[${t.flags.join(",")}]`);
      }
    } catch (e) {
      const sc: CaseScore = {
        caseId: c.id,
        title: c.title,
        group: c.group,
        vertical: c.vertical,
        turns: [],
        maxTotal: c.turns.length * 12,
        total: 0,
        flags: [],
        failureClasses: ["EVAL HARNESS ARTIFACT"],
        modelsUsed: [],
      };
      scores.push(sc);
      console.log(`[ERROR] ${c.id} ${c.title} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Aggregate metrics (counts only — never model payloads or secrets).
  const totalTurns = scores.reduce((a, s) => a + s.turns.length, 0);
  const maxPoints = scores.reduce((a, s) => a + s.maxTotal, 0);
  const earned = scores.reduce((a, s) => a + s.total, 0);
  const flagged = scores.reduce((a, s) => a + s.flags.length, 0);
  const modelsUsed = Array.from(
    new Set(scores.flatMap((s) => s.modelsUsed))
  );

  const taxonomy: Record<string, number> = {};
  for (const s of scores) {
    for (const f of s.failureClasses) taxonomy[f] = (taxonomy[f] ?? 0) + 1;
  }

  const json = {
    generatedAt: new Date().toISOString(),
    headSha: headSha(),
    totalCases: scores.length,
    totalTurns,
    maxPoints,
    earnedPoints: earned,
    flaggedTurns: flagged,
    modelsUsed,
    requests: requestCount,
    results: scores,
    failureTaxonomy: taxonomy,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, "real-model-eval-results.json"),
    JSON.stringify(json, null, 2),
    "utf8"
  );

  const lines: string[] = [];
  lines.push("# REAL-MODEL EVALUATION");
  lines.push("");
  lines.push(`- Generated: ${json.generatedAt}`);
  lines.push(`- HEAD: ${json.headSha}`);
  lines.push(`- Cases: ${json.totalCases} · Turns: ${json.totalTurns} · Model requests: ${json.requests}`);
  lines.push(`- Models observed: ${modelsUsed.join(", ") || "(none)"}`);
  lines.push(`- **Points: ${json.earnedPoints}/${json.maxPoints}** (${(100 * json.earnedPoints / Math.max(1, json.maxPoints)).toFixed(1)}%)`);
  lines.push(`- Flagged turns: ${json.flaggedTurns}`);
  lines.push("");
  lines.push("## Results");
  lines.push("");
  for (const s of scores) {
    lines.push(
      `### ${s.caseId} ${s.title} — ${s.failureClasses.length === 0 ? "PASS" : "FAIL"} (${s.total}/${s.maxTotal})`
    );
    for (const t of s.turns) {
      const sc = t.scores;
      lines.push(
        `- T${t.index} [${sc.semantic}/${sc.continuity}/${sc.structured}/${sc.factual}/${sc.correction}/${sc.naturalness}] = ${t.total}/12 intent=${t.intent ?? "null"} tools=[${t.toolCalls.join(",")}]${t.flags.length ? ` flags=[${t.flags.join(",")}]` : ""}`
      );
      lines.push(`  - „${t.reply.slice(0, 160)}“`);
    }
    if (s.failureClasses.length) {
      lines.push(`- Failure classes: ${s.failureClasses.join("; ")}`);
    }
    lines.push("");
  }
  lines.push("## Failure taxonomy");
  lines.push("");
  for (const [c, n] of Object.entries(taxonomy)) lines.push(`- ${c}: ${n}`);
  lines.push("");
  lines.push("## Axes legend");
  lines.push("semantic / continuity / structured / factual / correction / naturalness (each 0–2).");
  lines.push("");
  lines.push("> This is a measurement harness, not a CI gate. Deterministic suites remain the CI measure.");

  writeFileSync(resolve(OUT_DIR, "real-model-eval-report.md"), lines.join("\n"), "utf8");

  console.log(`\n== REAL-MODEL EVAL ${json.earnedPoints}/${json.maxPoints} ==`);
  console.log(`Report: ${resolve(OUT_DIR, "real-model-eval-report.md")}`);
  process.exitCode = 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
