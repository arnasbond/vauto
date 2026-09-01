/**
 * F1.3 — AI-down transparency and category neutrality focused suite.
 *
 * Audits: (1) provider errors/timeouts map to honest HTTP errors (never a
 * masked ok:true reply), (2) no synthetic transport anchor in the universal
 * memory context — a vehicle exists only when the user saved one, (3) text
 * extraction no longer forces the vehicles category from word substrings,
 * (4) the single highest-value question policy returns exactly one question.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentRouteError,
  normalizeAgentRouteError,
} from "../agent-errors.js";
import {
  AGENT_MEMORY_SYSTEM_HINT,
  buildAgentMemoryContextBlock,
} from "../agent-memory-context.js";
import { extractFromUserText } from "../sell/text-extract.js";
import { buildSellerContextualVoiceFollowUp } from "../seller-voice-prompt.js";

describe("F1.3 — AI-down transparency", () => {
  it("provider errors map to honest HTTP statuses (502/503/504)", () => {
    assert.deepEqual(
      normalizeAgentRouteError(new AgentRouteError("gemini_error", "Gemini 500", 502)),
      { status: 502, code: "gemini_error", message: "Gemini 500" }
    );
    assert.deepEqual(
      normalizeAgentRouteError(new AgentRouteError("timeout", "ilgai", 504)),
      { status: 504, code: "timeout", message: "ilgai" }
    );
    assert.deepEqual(
      normalizeAgentRouteError(new AgentRouteError("agent_unavailable", "down", 503)),
      { status: 503, code: "agent_unavailable", message: "down" }
    );
  });

  it("aborted requests normalize to a 504 timeout, not a masked success", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const normalized = normalizeAgentRouteError(abort);
    assert.equal(normalized.status, 504);
    assert.equal(normalized.code, "timeout");
  });

  it("unknown internal errors normalize to 503 agent_unavailable", () => {
    const normalized = normalizeAgentRouteError(new Error("boom"));
    assert.equal(normalized.status, 503);
    assert.equal(normalized.code, "agent_unavailable");
  });
});

describe("F1.3 — category neutrality (no synthetic transport anchor)", () => {
  it("memory hint is neutral: no Volvo/fleet default instruction", () => {
    assert.ok(!/Volvo|Fleet|primaryVehicle/i.test(AGENT_MEMORY_SYSTEM_HINT));
  });

  it("memory block has no vehicle line without a saved vehicle", () => {
    const block = buildAgentMemoryContextBlock({ defaultRegion: "" }, "rask batus");
    assert.ok(block, "block still built for neutral memory");
    assert.ok(!/Volvo|primaryVehicle|Fleet/i.test(block));
    assert.match(block, /defaultRegion=Visa Lietuva/);
  });

  it("memory block keeps the fleet line only for an explicit saved vehicle", () => {
    const block = buildAgentMemoryContextBlock(
      { primaryVehicle: { make: "Volvo", model: "V70", year: 2006 } },
      "rask priekinį bamperį"
    );
    assert.ok(block, "block built");
    assert.match(block!, /primaryVehicle=2006 m\. Volvo V70/);
  });

  it("text extraction: 'siuvimo mašina' no longer forces vehicles", () => {
    const bundle = extractFromUserText("parduodu siuvimo mašiną, veikia gerai");
    assert.ok(
      bundle.candidates.category?.value !== "vehicles",
      "word-substring must not force vehicles"
    );
  });

  it("text extraction: explicit vehicle brand still yields vehicles", () => {
    const bundle = extractFromUserText("parduodu Volvo V70, 2006 m.");
    assert.equal(bundle.candidates.category?.value, "vehicles");
  });

  it("text extraction: electronics cues stay electronics (regression)", () => {
    const bundle = extractFromUserText("parduodu iPhone 12");
    assert.equal(bundle.candidates.category?.value, "electronics");
  });
});

describe("F1.3 — single highest-value question", () => {
  it("the deterministic policy returns exactly ONE question, even with many missing fields", () => {
    const q = buildSellerContextualVoiceFollowUp(
      "vehicles",
      {},
      ["price", "sellerType", "city"]
    );
    assert.ok(q, "one question must be produced");
    assert.ok(!q.includes("\n"), "a single question string, never an interview list");
  });

  it("returns a single question for other verticals too", () => {
    const q = buildSellerContextualVoiceFollowUp("clothing", {}, ["price"]);
    assert.ok(q && !q.includes("\n"));
    const q2 = buildSellerContextualVoiceFollowUp("real_estate", {}, []);
    assert.ok(q2 === null || !q2.includes("\n"));
  });
});
