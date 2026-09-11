/**
 * R2.1 — deterministic sparse SELL gate in Pipeline B (vauto-unified two-pass).
 *
 * A bare SELL/CREATE intent with no grounded listing facts must NOT invoke the
 * creative Pass-2 (which could invent prose). It must produce a fact-only
 * draft with an EMPTY description — the same epistemic contract as Pipeline A.
 *
 * This is a DETERMINISTIC boundary (a code branch), not prompt guidance: even
 * if a scripted Pass-2 would return fabricated prose, the sparse gate must
 * short-circuit before it is ever called.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleVautoServerAction } from "../vauto-unified.js";
import {
  createScriptedModelProvider,
  round,
  text,
} from "../../golden/harness/scripted-model-provider.js";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

const JSON_PART = (obj: Record<string, unknown>) => text(JSON.stringify(obj));

describe("R2.1 — Pipeline B deterministic sparse SELL gate", () => {
  it("sparse 'Noriu įdėti buto skelbimą' returns an EMPTY description (no Pass-2 prose)", async () => {
    // Pass-1 returns minimal grounded facts; Pass-2 WOULD return fabricated prose
    // (proves the gate short-circuits before Pass-2 is ever consumed).
    const recorder = createScriptedModelProvider({
      turns: [
        [
          round(JSON_PART({ category: "NT", technicalFields: {}, intent: "sell", confidence: 0.5 })),
          round(JSON_PART({ title: "Butas pardavimui", description: "Parduodamas jaukus butas, puikiai tinkantis šeimai ar investicijai." })),
        ],
      ],
      exhausted: { parts: [JSON_PART({})] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "r21-test-key";
    try {
      const res = await handleVautoServerAction({
        action: "parse_text",
        text: "Noriu įdėti buto skelbimą",
        userCity: "Vilnius",
        contact: "+37060000000",
      });
      assert.ok(res.ok, "parse_text must succeed");
      const listing = (res as { listing?: { description?: string } }).listing ?? {};
      assert.equal(
        String(listing.description ?? ""),
        "",
        "sparse text must produce an empty description (no invented prose)"
      );
      // The fabricated Pass-2 round must never have been consumed.
      assert.equal(recorder.calls.length, 1, "Pass-2 must be skipped for sparse input");
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });

  it("non-sparse grounded text still reaches Pass-2 and keeps grounded prose", async () => {
    const recorder = createScriptedModelProvider({
      turns: [
        [
          round(JSON_PART({ category: "NT", technicalFields: { area: "62", rooms: "3" }, intent: "sell", confidence: 0.9 })),
          round(JSON_PART({ title: "3 kambarių butas Antakalnyje", description: "Parduodamas 62 m², 3 kambarių butas Antakalnyje. **Privalumai**\n- Plotas 62 m²\n- 3 kambariai" })),
        ],
      ],
      exhausted: { parts: [JSON_PART({})] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "r21-test-key";
    try {
      const res = await handleVautoServerAction({
        action: "parse_text",
        text: "Parduodu 62 m² 3 kambarių butą Antakalnyje, 4 aukštas",
        userCity: "Vilnius",
        contact: "+37060000000",
      });
      assert.ok(res.ok);
      const listing = (res as { listing?: { description?: string } }).listing ?? {};
      assert.ok(
        String(listing.description ?? "").length > 0,
        "grounded text must keep its polished description"
      );
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });

  it("non-sparse Pass-2 prose is tagged MODEL_INFERENCE (non-canonical proposal)", async () => {
    // Pass-2 appends UNSUPPORTED claims (balkonas/parkingas/rami vieta/šviesa).
    // The prose may remain, but its provenance must be MODEL_INFERENCE so it
    // cannot silently become canonical listing fact.
    const recorder = createScriptedModelProvider({
      turns: [
        [
          round(JSON_PART({ category: "NT", technicalFields: { area: "62", rooms: "3" }, intent: "sell", confidence: 0.9 })),
          round(JSON_PART({ title: "3 kambarių butas Antakalnyje", description: "Parduodamas 62 m², 3 kambarių butas Antakalnyje su balkonu, parkingu, ramioje vietoje, puikiai apšviestas. **Privalumai**\n- Plotas 62 m²\n- 3 kambariai" })),
        ],
      ],
      exhausted: { parts: [JSON_PART({})] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "r21-test-key";
    try {
      const res = await handleVautoServerAction({
        action: "parse_text",
        text: "Parduodu 62 m² 3 kambarių butą Antakalnyje, 4 aukštas",
        userCity: "Vilnius",
        contact: "+37060000000",
      });
      assert.ok(res.ok);
      const listing = res as { listing?: { descriptionSource?: string } };
      assert.equal(
        listing.listing?.descriptionSource,
        "MODEL_INFERENCE",
        "Pass-2 prose must be tagged MODEL_INFERENCE (non-canonical)"
      );
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });
});
