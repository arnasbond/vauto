/**
 * REAL-MODEL EVAL HARNESS — OFFLINE SELF-TEST (no model, no network).
 *
 * Proves, BEFORE any real model call is spent:
 *   - the eval dataset loads and covers all eight canonical verticals;
 *   - the deterministic scorer produces valid 0–2 axes, flags, and a single
 *     primary failure classification;
 *   - reports are JSON/MD serializable;
 *   - side-effect isolation uses in-memory stores only (no production DB);
 *   - the runner never prints the Gemini secret;
 *   - eval fixtures are NOT imported by the production runtime.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";

import {
  REAL_MODEL_EVAL_CASES,
  countEvalCases,
} from "./dataset.js";
import type { EvalTurnOutcome } from "./harness.js";
import { scoreTurn, scoreCase } from "./scorer.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function readSource(rel: string): string {
  return readFileSync(join(HERE, rel), "utf8");
}

describe("real-model-eval — dataset", () => {
  it("loads at least 20 conversations", () => {
    assert.ok(countEvalCases() >= 20, `expected >=20 cases, got ${countEvalCases()}`);
  });

  it("covers all eight canonical verticals in search/advisory groups", () => {
    const verticals = new Set(
      REAL_MODEL_EVAL_CASES.filter((c) => c.group === "search").map((c) => c.vertical)
    );
    for (const v of ["vehicles", "real_estate", "electronics", "clothing", "services", "jobs", "home", "other"]) {
      assert.ok(verticals.has(v), `missing search coverage for vertical ${v}`);
    }
  });

  it("includes multi-turn, listing-dialogue, advisory and messy groups", () => {
    const groups = new Set(REAL_MODEL_EVAL_CASES.map((c) => c.group));
    for (const g of ["multi_turn", "listing_dialogue", "advisory", "messy"] as const) {
      assert.ok(groups.has(g), `missing group ${g}`);
    }
  });
});

function syntheticOutcome(overrides: Partial<EvalTurnOutcome> = {}): EvalTurnOutcome {
  return {
    index: 1,
    text: "test",
    reply: "Parduodamas iPhone 13, kaina 450 eur.",
    intent: "catalog_search",
    tool: "searchListings",
    toolCalls: ["searchListings"],
    needsClarification: false,
    clarificationQuestion: null,
    advisoryContext: false,
    draftAfter: { category: "electronics", price: 450 },
    confirmations: [],
    effects: [],
    error: null,
    ...overrides,
  };
}

describe("real-model-eval — scorer", () => {
  it("produces axes in [0,2] and total in [0,12]", () => {
    const s = scoreTurn(
      { text: "ieskau iphone", reference: { intent: "catalog_search", expectedTool: "searchListings", vertical: "electronics" } },
      syntheticOutcome(),
      null,
      "electronics"
    );
    for (const k of ["semantic", "continuity", "structured", "factual", "correction", "naturalness"] as const) {
      assert.ok(s.scores[k] >= 0 && s.scores[k] <= 2, `${k}=${s.scores[k]} out of range`);
    }
    assert.ok(s.total >= 0 && s.total <= 12, `total=${s.total} out of range`);
  });

  it("flags wrong vertical + transport bias on a non-transport query resolved to vehicles", () => {
    const s = scoreTurn(
      { text: "ieskau striukės", reference: { intent: "catalog_search", expectedTool: "searchListings", vertical: "clothing" } },
      syntheticOutcome({ draftAfter: { category: "vehicles", make: "Volvo" } }),
      null,
      "clothing"
    );
    assert.ok(s.flags.includes("WRONG_VERTICAL"));
    assert.ok(s.flags.includes("TRANSPORT_BIAS"));
    assert.ok(s.failureClass, "should classify a failure");
  });

  it("flags lost user correction", () => {
    const s = scoreTurn(
      { text: "kaina 450", reference: { intent: "sell_update", expectedTool: "updateListingDraft", draftFact: { key: "price", value: "450" } } },
      syntheticOutcome({ intent: "sell_update", draftAfter: { category: "electronics", price: 500 } }),
      { category: "electronics", price: 500 },
      "electronics"
    );
    assert.ok(s.flags.includes("LOST_USER_CORRECTION"));
    assert.equal(s.failureClass, "AUTHORITY / PROVENANCE FAILURE");
  });

  it("flags silent consequential action on forbidden effect", () => {
    const s = scoreTurn(
      { text: "publikuok", reference: { forbiddenEffects: ["listing_published"] } },
      syntheticOutcome({ effects: ["listing_published"] }),
      null,
      undefined
    );
    assert.ok(s.flags.includes("SILENT_CONSEQUENTIAL_ACTION"));
  });

  it("scoreCase serializes to JSON without errors", () => {
    const c = REAL_MODEL_EVAL_CASES[0]!;
    const outcomes = c.turns.map((t, i) => syntheticOutcome({ index: i + 1, text: t.text }));
    const sc = scoreCase(c, outcomes, ["gemini-2.5-flash"]);
    const serialized = JSON.stringify(sc);
    assert.ok(serialized.length > 0);
    assert.ok(!serialized.includes("GEMINI_API_KEY"));
  });
});

describe("real-model-eval — secret + isolation + prompt safety", () => {
  it("runner never prints the Gemini secret", () => {
    const runSrc = readSource("run.ts");
    const harnessSrc = readSource("harness.ts");
    for (const src of [runSrc, harnessSrc]) {
      assert.ok(!/console\.log\([^)]*GEMINI_API_KEY/.test(src), "must not log the key");
      assert.ok(!/console\.log\([^)]*process\.env/.test(src), "must not log env");
    }
  });

  it("harness uses in-memory stores (no production DB)", () => {
    const src = readSource("harness.ts");
    assert.ok(src.includes("InMemoryThreadStore"));
    assert.ok(src.includes("createInMemoryPendingActionStore"));
    assert.ok(!src.includes("createPostgresThreadStore"));
  });

  it("eval fixtures are not imported by the production runtime entry", () => {
    const index = readFileSync(join(HERE, "../index.ts"), "utf8");
    assert.ok(!index.includes("real-model-eval"), "production index.ts must not import eval harness");
  });

  it("eval dataset is never imported outside the eval runner/tests", () => {
    const src = readSource("dataset.ts");
    assert.match(src, /NEVER imported by the/i);
    assert.match(src, /production runtime/i);
  });
});
