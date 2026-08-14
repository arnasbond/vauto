/**
 * Intent Engine 10A golden corpus runner + quality metrics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAiQualityMetrics,
  setAiTelemetrySink,
  type AiTelemetryEvent,
} from "../../foundation/index.js";
import {
  INTENT_ENGINE_ACTION_EXECUTION,
  classifyIntent,
  parseIntentResult,
} from "../index.js";
import { corpusDistribution, INTENT_GOLDEN_CORPUS } from "./corpus.js";

function entityMatch(
  expected: Record<string, unknown> | undefined,
  actual: Record<string, unknown>,
  keys: string[] | undefined
): boolean {
  if (!keys || keys.length === 0) return true;
  if (!expected) return keys.every((k) => actual[k] != null && actual[k] !== "");
  for (const k of keys) {
    const exp = expected[k];
    const got = actual[k];
    if (exp === undefined) {
      if (got == null || got === "") return false;
      continue;
    }
    if (Array.isArray(exp)) {
      if (!Array.isArray(got)) return false;
      if (exp.some((x) => !got.includes(x))) return false;
      continue;
    }
    if (typeof exp === "string") {
      if (typeof got !== "string") return false;
      if (got.toLowerCase() !== exp.toLowerCase()) return false;
      continue;
    }
    if (got !== exp) return false;
  }
  return true;
}

describe("Intent Engine 10A golden corpus", () => {
  it("meets PASS gates on offline corpus (≥150)", async () => {
    const dist = corpusDistribution();
    assert.ok(dist.total >= 150, `corpus size ${dist.total}`);
    assert.ok((dist.search_buy ?? 0) >= 25);
    assert.ok((dist.sell ?? 0) >= 25);
    assert.ok((dist.value ?? 0) >= 20);
    assert.ok((dist.compare ?? 0) >= 15);
    assert.ok((dist.watch ?? 0) >= 15);
    assert.ok((dist.help ?? 0) >= 10);
    assert.ok((dist.unknown ?? 0) >= 20);
    assert.ok((dist.adversarial ?? 0) >= 20);

    assert.equal(INTENT_ENGINE_ACTION_EXECUTION, false);

    const env = {
      ...process.env,
      AI_MODEL_FAST: "foundation-fast-alias",
      AI_MODEL_FALLBACK: "foundation-fallback-alias",
    };
    const prev = { ...process.env };
    Object.assign(process.env, env);

    const telemetry: AiTelemetryEvent[] = [];
    setAiTelemetrySink((e) => telemetry.push(e));

    const latencies: number[] = [];
    let intentHits = 0;
    let entityChecked = 0;
    let entityHits = 0;
    let schemaValid = 0;
    let adversarialSafe = 0;
    const failures: string[] = [];

    try {
      for (const c of INTENT_GOLDEN_CORPUS) {
        const t0 = Date.now();
        const result = await classifyIntent({
          text: c.text,
          requestId: c.id,
          llmCaller: null,
        });
        const ms = Date.now() - t0;
        latencies.push(ms);

        // 100% schema-valid
        parseIntentResult(result);
        schemaValid += 1;

        assert.equal(result.originalText, c.text.slice(0, 4000));
        assert.ok(result.foundationVersion);

        if (result.intent === c.expectedIntent) intentHits += 1;
        else failures.push(`${c.id}: intent ${result.intent}!=${c.expectedIntent} :: ${c.text}`);

        if (c.requiredEntityKeys?.length) {
          entityChecked += 1;
          if (
            entityMatch(
              c.expectedEntities as Record<string, unknown> | undefined,
              result.entities as Record<string, unknown>,
              c.requiredEntityKeys as string[]
            )
          ) {
            entityHits += 1;
          } else {
            failures.push(
              `${c.id}: entities expected=${JSON.stringify(c.expectedEntities)} got=${JSON.stringify(result.entities)}`
            );
          }
        }

        if (c.adversarial) {
          const safe =
            result.intent === "UNKNOWN" &&
            (result.abstained || result.requiresConfirmation);
          if (safe) adversarialSafe += 1;
          else failures.push(`${c.id}: adversarial not safe ${result.intent}`);
        }
      }
    } finally {
      setAiTelemetrySink(null);
      for (const k of Object.keys(process.env)) {
        if (!(k in prev)) delete process.env[k];
      }
      Object.assign(process.env, prev);
    }

    const intentAccuracy = intentHits / INTENT_GOLDEN_CORPUS.length;
    const entityAccuracy = entityChecked ? entityHits / entityChecked : 1;
    const schemaRate = schemaValid / INTENT_GOLDEN_CORPUS.length;
    const advRate = adversarialSafe / (dist.adversarial ?? 1);

    const quality = computeAiQualityMetrics(
      INTENT_GOLDEN_CORPUS.map((_, i) => ({
        accurate: i < intentHits ? true : false, // placeholder shape; real rates below
        latencyMs: latencies[i] ?? 0,
        fallbackUsed: false,
        abstained: false,
        userCorrected: false,
        estimatedCost: null,
      }))
    );

    // Recompute latency percentiles from measured latencies
    const sorted = [...latencies].sort((a, b) => a - b);
    const pct = (p: number) => {
      if (!sorted.length) return 0;
      const idx = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo]!;
      return sorted[lo]! * (1 - (idx - lo)) + sorted[hi]! * (idx - lo);
    };
    const p50 = pct(50);
    const p95 = pct(95);

    // Telemetry privacy: no prompt / PII keys or user text echoes
    for (const ev of telemetry) {
      const json = JSON.stringify(ev);
      assert.ok(!/"prompt"/i.test(json));
      assert.ok(!/"ocr"/i.test(json));
      assert.ok(!json.includes("Ignore previous instructions"));
      assert.ok(ev.foundationVersion);
      assert.equal(ev.taskClass, "FAST");
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          corpus: dist,
          intentAccuracy,
          entityAccuracy,
          schemaRate,
          adversarialSafeRate: advRate,
          latencyMs: { p50, p95, max: sorted.at(-1) ?? 0 },
          telemetryEvents: telemetry.length,
          failureCount: failures.length,
          sampleFailures: failures.slice(0, 12),
          qualitySampleCount: quality.sampleCount,
        },
        null,
        2
      )
    );

    assert.equal(schemaRate, 1, "schema-valid must be 100%");
    assert.ok(intentAccuracy >= 0.95, `intent accuracy ${intentAccuracy} < 0.95; ${failures.slice(0, 8).join(" | ")}`);
    assert.ok(
      entityAccuracy >= 0.92,
      `entity accuracy ${entityAccuracy} < 0.92; ${failures.filter((f) => f.includes("entities")).slice(0, 8).join(" | ")}`
    );
    assert.equal(advRate, 1, "all adversarial must abstain/UNKNOWN");
    assert.equal(INTENT_ENGINE_ACTION_EXECUTION, false);
  });

  it("rejects invalid LLM JSON via Zod and keeps safe UNKNOWN/rules path", async () => {
    process.env.AI_MODEL_FAST = "foundation-fast-alias";
    const result = await classifyIntent({
      text: "Ieškau BMW",
      llmCaller: async () => ({ intent: "HACK", confidence: 1, entities: {} }),
    });
    parseIntentResult(result);
    // Invalid LLM must not crash; rules still classify SEARCH
    assert.equal(result.intent, "SEARCH");
    assert.equal(result.originalText, "Ieškau BMW");
  });
});
