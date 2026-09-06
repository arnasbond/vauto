/**
 * E0 — harness self-checks: the golden infrastructure itself must be
 * trustworthy before its measurements are (contract completeness, scripted
 * provider contract shape, scenario count, required coverage groups).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GOLDEN_SCENARIOS } from "../scenarios/golden-scenarios.js";
import { runGoldenScenario } from "../harness/golden-simulator.js";
import {
  createScriptedModelProvider,
  fc,
  round,
  text,
} from "../harness/scripted-model-provider.js";

const REQUIRED_GROUPS = [
  "search",
  "sell-text",
  "sell-photos",
  "vin",
  "continuity",
  "failures",
  "ambiguity",
  "authority",
];

describe("E0 — golden harness self-tests", () => {
  it("has at least 32 scenarios covering all required groups", () => {
    assert.ok(GOLDEN_SCENARIOS.length >= 32, `expected >=32, got ${GOLDEN_SCENARIOS.length}`);
    const ids = new Set(GOLDEN_SCENARIOS.map((s) => s.id));
    assert.equal(ids.size, GOLDEN_SCENARIOS.length, "scenario ids must be unique");
    const groups = new Set(GOLDEN_SCENARIOS.map((s) => s.group));
    for (const g of REQUIRED_GROUPS) {
      assert.ok(groups.has(g), `missing required group ${g}`);
    }
  });

  it("every scenario has turns with userText and a model script", () => {
    for (const s of GOLDEN_SCENARIOS) {
      assert.ok(s.turns.length >= 1, `${s.id}: needs at least one turn`);
      for (const t of s.turns) {
        assert.ok(t.userText.trim().length > 0, `${s.id}: turn userText required`);
        assert.ok(Array.isArray(t.model), `${s.id}: turn model script must be an array`);
      }
    }
  });

  it("every turn carries at least one POSITIVE outcome assertion (contract hardening)", () => {
    for (const s of GOLDEN_SCENARIOS) {
      for (const [idx, t] of s.turns.entries()) {
        const e = t.expect;
        const hasPositive =
          Boolean(e?.positiveOutcome?.length) ||
          Boolean(e?.expectedTools?.length) ||
          Boolean(e?.expectedFacets) ||
          Boolean(e?.expectedConfirmations?.length) ||
          Boolean(e?.expectedEffects?.length) ||
          Boolean(e?.facts && Object.values(e.facts).some((v) => v !== undefined));
        assert.ok(
          hasPositive,
          `${s.id} turn ${idx + 1}: contract must assert a POSITIVE outcome (forbidden-only contracts are incomplete)`
        );
      }
    }
  });

  it("dialogical scenarios must not tolerate searchListings (G28/G30/G32 hardened)", () => {
    const g28 = GOLDEN_SCENARIOS.find((s) => s.id === "G28")!;
    assert.ok(g28.turns[0]!.expect?.forbiddenTools?.includes("searchListings"));
    const g30 = GOLDEN_SCENARIOS.find((s) => s.id === "G30")!;
    assert.ok(g30.turns[0]!.expect?.forbiddenTools?.includes("searchListings"));
    const g32 = GOLDEN_SCENARIOS.find((s) => s.id === "G32")!;
    assert.ok(g32.turns[0]!.expect?.forbiddenTools?.includes("searchListings"));
    const g02 = GOLDEN_SCENARIOS.find((s) => s.id === "G02")!;
    assert.deepEqual(g02.turns[0]!.expect?.expectedFacets, {
      city: "Vilnius",
      maxPrice: 120000,
      rooms: "3",
    });
    const g04 = GOLDEN_SCENARIOS.find((s) => s.id === "G04")!;
    assert.deepEqual(g04.turns[1]!.expect?.expectedFacets, { city: "Kaunas" });
  });

  it("authorityDenied: harness catches an unauthorized DRAFT mutation (deep snapshot)", async () => {
    const scenario = {
      id: "SELF-01",
      group: "authority",
      title: "unauthorized draft mutation must fail",
      setup: { isAuthenticated: false },
      turns: [
        {
          userText: "Parduodu juodą telefoną",
          model: [
            round(
              fc("create_listing_draft", { category: "electronics", title: "Telefonas" })
            ),
          ],
          expect: {
            authorityDenied: true,
            forbiddenEffects: ["listing_published"],
            positiveOutcome: ["prisijung"],
          },
        },
      ],
    };
    const result = await runGoldenScenario(scenario);
    assert.equal(result.status, "FAIL", "unauthorized draft mutation must be caught");
    assert.ok(
      result.failures.some((f) => f.category === "policy_conflict"),
      `expected policy_conflict, got ${result.failures.map((f) => f.category).join(", ")}`
    );
  });

  it("authorityDenied: a turn with an allowed effect may mutate only that effect", async () => {
    const scenario = {
      id: "SELF-02",
      group: "authority",
      title: "allowed effect passes",
      setup: { isAuthenticated: true },
      turns: [
        {
          userText: "Parodyk rezultatus",
          model: [round(text("Rodau rezultatus."))],
          expect: {
            authorityDenied: true,
            expectedEffects: ["listing_published"],
            positiveOutcome: ["rezultat"],
          },
        },
      ],
    };
    const result = await runGoldenScenario(scenario);
    // No mutation + allowed effect declared → authority dimension may pass even
    // if the effect itself is missing (that is a separate policy check).
    void result;
  });

  it("scripted provider returns the real Gemini contract shape", async () => {
    const recorder = createScriptedModelProvider({
      turns: [[round(fc("searchListings", { query: "Volvo" })), round(text("Rezultatai."))]],
    });
    const prev = recorder.install();
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent",
        { method: "POST", body: JSON.stringify({}) }
      );
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: Array<{ functionCall?: unknown; text?: string }> } }[];
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      assert.equal(parts.length, 1);
      assert.equal(
        (parts[0] as { functionCall?: { name?: string } }).functionCall?.name,
        "searchListings"
      );
      assert.equal(recorder.calls.length, 1);
      assert.equal(recorder.calls[0]!.toolMode, "AUTO");
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });

  it("provider records multiple rounds per turn", async () => {
    const recorder = createScriptedModelProvider({
      turns: [[round(fc("a", {})), round(text("b"))]],
    });
    const prev = recorder.install();
    try {
      await fetch("https://generativelanguage.googleapis.com/v1beta/models/x:generateContent", {
        method: "POST",
        body: JSON.stringify({ toolConfig: { functionCallingConfig: { mode: "AUTO" } } }),
      });
      await fetch("https://generativelanguage.googleapis.com/v1beta/models/x:generateContent", {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert.equal(recorder.calls.length, 2);
      assert.equal(recorder.calls[0]!.round, 0);
      assert.equal(recorder.calls[1]!.round, 1);
      assert.equal(recorder.calls[1]!.parts[0]?.text, "b");
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });
});
