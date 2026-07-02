#!/usr/bin/env node
/**
 * Visual pipeline QA CLI — runs fixture-based extraction smoke tests.
 */
import { runVisualPipelineQaSuite } from "../dist/test/visual-pipeline-qa.js";

const suite = runVisualPipelineQaSuite();
for (const r of suite.results) {
  const status = r.ok ? "OK" : "FAIL";
  console.log(`${status} ${r.id}${r.errors.length ? `: ${r.errors.join("; ")}` : ""}`);
}
console.log(`\nVisual pipeline QA: ${suite.passed}/${suite.results.length} passed`);
process.exit(suite.failed > 0 ? 1 : 0);
