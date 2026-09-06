/**
 * E2.8 CLIENT AUTHORITY FIX — regression suite for
 * `resolveCommandMaterialization`.
 *
 * Invariant: RAW USER TEXT IS NOT SEARCH AUTHORIZATION. The client may
 * materialize search state (query/facets/filters/grid/results scroll)
 * ONLY from a server-authorized action outcome for the current turn.
 *
 *   A. advisory + actions none  → conversational only
 *   B. advisory + denied tool   → same (server returns actions none)
 *   C. explicit search          → search state executes (apply + persist)
 *   D. classic/manual/conversational non-advisory → unchanged behavior
 *   E. explicit wanted          → wanted flow preserved
 *   F. AI-down + advisory       → NO deterministic catalog search
 *   G. AI-down + explicit search → deterministic fallback kept
 *   H. repeated advisory        → no accumulated materialization
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveCommandMaterialization,
  type CommandTurnOutcome,
} from "@/lib/ai-command-authority";
import { isClientAdvisoryQuery } from "@/lib/gemini-search-intent";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

const ADVISORY =
  "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. eurų, ką siūlytum?";

function outcome(partial: Partial<CommandTurnOutcome>): CommandTurnOutcome {
  return { ok: false, ...partial };
}

describe("E2.8 — client command authority (advisory never materializes)", () => {
  it("A. advisory + actions none → conversational only, both paths", () => {
    for (const path of ["conductor", "legacy"] as const) {
      const d = resolveCommandMaterialization(
        outcome({ actions: { type: "none" }, ok: true, reply: "Rekomenduoju..." }),
        ADVISORY,
        path
      );
      assert.equal(d.applyActions, null);
      assert.equal(d.persistQuery, false, "raw text must not become searchQuery");
      assert.equal(d.scrollToResults, false);
      assert.equal(d.deterministicFallback, false);
      assert.equal(d.clearDraftOnly, true, "input clears, reply stays visible");
    }
  });

  it("B. advisory + denied tool (server still answers) → same invariant", () => {
    const d = resolveCommandMaterialization(
      outcome({
        actions: { type: "none" },
        ok: true,
        reply: "Skatinti negalima, bet štai mano rekomendacija: ...",
      }),
      ADVISORY,
      "conductor"
    );
    assert.equal(d.persistQuery, false);
    assert.equal(d.scrollToResults, false);
    assert.equal(d.deterministicFallback, false);
  });

  it("C. explicit search action executes (legacy: apply+persist, no forced scroll)", () => {
    const search: VautoAgentAction = {
      type: "search",
      searchQuery: "kia sportage iki 20000",
      listingIds: ["a1", "a2"],
    };
    for (const path of ["conductor", "legacy"] as const) {
      const d = resolveCommandMaterialization(
        outcome({ actions: search, ok: true }),
        "surask Kia Sportage iki 20000",
        path
      );
      assert.equal(d.applyActions, search);
      assert.equal(d.persistQuery, true);
      assert.equal(d.scrollToResults, path === "conductor");
      assert.equal(d.deterministicFallback, false);
    }
  });

  it("C. empty_search and apply_ui_filters actions stay authorized", () => {
    const empty: VautoAgentAction = {
      type: "empty_search",
      searchQuery: "kia sportage",
    };
    const filters: VautoAgentAction = { type: "apply_ui_filters", query: "iki 20000" };
    for (const a of [empty, filters]) {
      const d = resolveCommandMaterialization(
        outcome({ actions: a, ok: true }),
        "automobiliai iki 20000",
        "legacy"
      );
      assert.equal(d.applyActions, a);
      assert.equal(d.persistQuery, true);
    }
  });

  it("D. conversational non-advisory reply without action keeps legacy behavior", () => {
    const d = resolveCommandMaterialization(
      outcome({ ok: true, reply: "Talpinimas kainuoja 5 Eur." }),
      "Kiek kainuoja skelbimo talpinimas?",
      "legacy"
    );
    assert.equal(d.applyActions, null);
    assert.equal(d.persistQuery, false);
    assert.equal(d.scrollToResults, false);
    assert.equal(d.clearDraftOnly, true);
    assert.equal(d.deterministicFallback, false);
  });

  it("E. explicit wanted (create_user_requirement) flow preserved byte-for-byte", () => {
    const wanted: VautoAgentAction = {
      type: "create_user_requirement",
      query: "kia sportage iki 20000",
    };
    const d = resolveCommandMaterialization(
      outcome({ actions: wanted, ok: true }),
      "Pranešk, kai atsiras Kia Sportage iki 20000",
      "legacy"
    );
    assert.equal(d.applyActions, wanted, "wanted action must still be applied");
    assert.equal(d.persistQuery, true, "wanted flow keeps its query readout");
    assert.equal(d.deterministicFallback, false);
  });

  it("F. AI-down + advisory must NOT become deterministic catalog search", () => {
    for (const path of ["conductor", "legacy"] as const) {
      const d = resolveCommandMaterialization(
        outcome({ ok: false }),
        ADVISORY,
        path
      );
      assert.equal(d.deterministicFallback, false, path);
      assert.equal(d.persistQuery, false, path);
      assert.equal(d.scrollToResults, false, path);
    }
  });

  it("G. AI-down + genuine explicit search keeps deterministic fallback", () => {
    for (const q of [
      "surask Kia Sportage iki 20000",
      "automobiliai iki 20000",
      "parodyk šeimai automobilius iki 20000",
    ]) {
      const d = resolveCommandMaterialization(outcome({ ok: false }), q, "legacy");
      assert.equal(d.deterministicFallback, true, q);
    }
  });

  it("H. repeated advisory turns accumulate NO materialization", () => {
    const variants: Array<Partial<CommandTurnOutcome>> = [
      { actions: { type: "none" }, ok: true, reply: "Patarimas..." },
      { actions: { type: "none" }, ok: false },
      { ok: false },
      { ok: false, reply: "Esu čia padėti..." },
      { ok: true, reply: "Rekomenduoju šeimyninį hečbeką..." },
    ];
    for (const path of ["conductor", "legacy"] as const) {
      for (let i = 0; i < 5; i++) {
        for (const v of variants) {
          const d = resolveCommandMaterialization(outcome(v), ADVISORY, path);
          assert.equal(d.persistQuery, false, `round ${i} ${path}`);
          assert.equal(d.deterministicFallback, false, `round ${i} ${path}`);
        }
      }
    }
  });
});

describe("E2.8 — isClientAdvisoryQuery (deterministic client mirror)", () => {
  it("live production advisory input is advisory", () => {
    assert.equal(isClientAdvisoryQuery(ADVISORY), true);
  });

  it("explicit search verbs are never advisory", () => {
    for (const q of [
      "surask Kia Sportage iki 20000",
      "automobiliai iki 20000",
      "parodyk šeimai automobilius iki 20000",
      "Pranešk, kai atsiras Kia Sportage iki 20000",
    ]) {
      assert.equal(isClientAdvisoryQuery(q), false, q);
    }
  });

  it("empty input is not advisory", () => {
    assert.equal(isClientAdvisoryQuery("   "), false);
  });
});
