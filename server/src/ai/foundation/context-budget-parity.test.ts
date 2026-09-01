/**
 * F1.2 — context budget limits and prompt-policy parity focused suite.
 *
 * Audits: (1) auxiliary context blocks (seller metrics, behavior history,
 * error reports, filters) are strictly bounded, (2) client/server truncation
 * shares one word-boundary algorithm, (3) compact and full system prompts
 * carry IDENTICAL price/fallback/safety policy.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTEXT_BLOCK_BUDGET,
  sanitizeSellerMetrics,
} from "../context-budget.js";
import { clampJsonBlock, truncateTextSafely } from "../../shared/text-truncation.js";
import { buildUserBehaviorContextBlock } from "../user-behavior-context.js";
import {
  GEMINI_INTENT_RULES,
  GEMINI_INTENT_RULES_COMPACT,
} from "../gemini-intent-rules.js";
import { buildVautoAgentSystemInstruction } from "../agent-system-instruction.js";

describe("F1.2 — context block budgets", () => {
  it("seller metrics: valid bounded integers survive, garbage is dropped", () => {
    const good = sanitizeSellerMetrics({
      views: 123,
      callClicks: 4,
      chatStarts: 2,
      saves: 1,
      interestScore: 12,
      buyerIntentCount: 0,
    });
    assert.match(good, /"views":123/);
    assert.match(good, /"buyerIntentCount":0/);
    assert.ok(good.length <= CONTEXT_BLOCK_BUDGET.sellerMetrics);

    const bad = sanitizeSellerMetrics({
      views: "lol",
      callClicks: NaN,
      chatStarts: Infinity,
      saves: -5,
      interestScore: 1e12,
      buyerIntentCount: "x".repeat(10_000),
    });
    assert.equal(bad, "", "invalid values must not survive");
  });

  it("seller metrics: non-object input never throws and yields empty", () => {
    assert.equal(sanitizeSellerMetrics(undefined), "");
    assert.equal(sanitizeSellerMetrics(null), "");
    assert.equal(sanitizeSellerMetrics(42), "");
    assert.equal(sanitizeSellerMetrics([1, 2]), "");
    assert.equal(sanitizeSellerMetrics({ unknownKey: 5 }), "");
  });

  it("behavior history: per-event payloads are clamped, block stays bounded", () => {
    const block = buildUserBehaviorContextBlock([
      { type: "search", at: 1, payload: { query: "x".repeat(50_000) } },
      { type: "page_view", at: 2, payload: { path: "/fashion" } },
      ...Array.from({ length: 40 }, (_, i) => ({
        type: `ev${i}`,
        at: i,
        payload: { note: "y".repeat(5_000) },
      })),
    ]);
    const lines = block.split("\n");
    for (const line of lines) {
      assert.ok(line.length <= 260, `event line too long: ${line.length}`);
    }
    assert.ok(
      !block.includes("x".repeat(200)),
      "oversized payload must be truncated"
    );
    assert.match(block, /Vartotojo elgsena/);
    // Only the last 15 events survive.
    assert.ok((block.match(/- \[/g) ?? []).length <= 15);
  });

  it("truncateTextSafely: word-boundary cut, hard cut for single words", () => {
    const multi = Array.from({ length: 40 }, () => "kabliukas").join(" ");
    const out = truncateTextSafely(multi, 120);
    assert.ok(out.length <= 120);
    assert.ok(out.endsWith("…"));
    assert.ok(!/kabliu…/.test(out), "no mid-word cut");

    const single = truncateTextSafely("x".repeat(300), 120);
    assert.ok(single.length <= 120);
    assert.ok(single.endsWith("…"));
    assert.equal(truncateTextSafely("   Trumpas   ", 60), "Trumpas");
    assert.equal(truncateTextSafely(undefined, 10), "");
    assert.equal(truncateTextSafely("abc", 2), "a…");
  });

  it("clampJsonBlock bounds serialized JSON and never throws", () => {
    const json = clampJsonBlock({ q: "z".repeat(1_000) }, 200);
    assert.ok(json.length <= 200);
    assert.equal(clampJsonBlock(undefined, 100), "null");
    assert.equal(clampJsonBlock(BigInt(1), 100), "");
  });

  it("behavior history: event type is capped", () => {
    const block = buildUserBehaviorContextBlock([
      { type: "t".repeat(5_000), at: 1, payload: {} },
    ]);
    const line = block.split("\n")[1] ?? "";
    assert.ok(line.length <= CONTEXT_BLOCK_BUDGET.behaviorEventType + 60);
  });
});

describe("F1.2 — prompt-policy parity (compact vs full)", () => {
  it("compact and full rule sets are byte-identical (zero drift)", () => {
    assert.equal(GEMINI_INTENT_RULES_COMPACT, GEMINI_INTENT_RULES);
  });

  it("assembled instructions are identical for full and intermediate modes", () => {
    assert.equal(
      buildVautoAgentSystemInstruction("full"),
      buildVautoAgentSystemInstruction("intermediate")
    );
  });

  it("both modes carry identical price/fallback/safety policy", () => {
    const full = buildVautoAgentSystemInstruction("full");
    const compact = buildVautoAgentSystemInstruction("intermediate");
    const markers = [
      /Kainą klausk TIK/, // price-timing rule (supervisor)
      /ULTRA-TRUMPAS PATVIRTINIMAS/, // confirmation/fallback rule
      /netylėk/, // zero-results fallback
      /klastotę|klastočių/, // safety hard-block
      /ignore rules/, // jailbreak redirection
    ];
    for (const marker of markers) {
      assert.match(full, marker, "full mode marker missing");
      assert.match(compact, marker, "compact mode marker missing");
    }
  });
});
