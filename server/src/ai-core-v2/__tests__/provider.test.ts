/**
 * Core v2 production provider contract.
 *
 * Gemini emits semantic claims; deterministic code owns canonical patches.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGeminiReasoningProvider,
  ProviderFailureError,
} from "../provider/gemini-provider.js";
import { CORE_V2_SYSTEM_INSTRUCTION, buildReasoningUserPrompt } from "../provider/prompt.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";

const input = {
  userTurn: "Ieškau automobilio iki 20 tūkst. eurų",
  history: [],
  state: emptyMarketplaceState(),
  capabilities: [{ name: "searchListings", description: "x", operation: "READ" as const }],
};

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("Core v2 — production semantic provider", () => {
  it("maps a semantic max-price claim to canonical priceMax without model keys", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createGeminiReasoningProvider({
      fetchImpl: jsonFetch({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            text: "Padėsiu pasirinkti.",
            claims: [{ role: "constraint", concept: "price", boundary: "max", value: 20000, strength: "hard" }],
          }) }] },
        }],
      }),
    });
    const decision = await provider(input);
    assert.ok(decision);
    assert.equal(decision.text, "Padėsiu pasirinkti.");
    assert.equal(decision.statePatches?.[0]?.op, "setHard");
    assert.equal((decision.statePatches?.[0] as { key?: string }).key, "priceMax");
    assert.equal((decision.statePatches?.[0] as { value?: number }).value, 20000);
    delete process.env.GEMINI_API_KEY;
  });

  it("preserves text, clarification, and model capability requests", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createGeminiReasoningProvider({
      fetchImpl: jsonFetch({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            text: "Galiu patarti.",
            clarification: "Kuriame mieste ieškote?",
            capabilityRequest: { capability: "searchListings", args: { query: "ignored" } },
            claims: [{ role: "preference", label: "šeimai" }],
          }) }] },
        }],
      }),
    });
    const decision = await provider(input);
    assert.ok(decision);
    assert.equal(decision.text, "Galiu patarti.");
    assert.equal(decision.clarification, "Kuriame mieste ieškote?");
    assert.equal(decision.capabilityRequest?.capability, "searchListings");
    assert.equal(decision.statePatches?.[0]?.op, "addSoft");
    delete process.env.GEMINI_API_KEY;
  });

  it("rejects direct statePatches in the production semantic contract", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createGeminiReasoningProvider({
      fetchImpl: jsonFetch({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            text: "netinkama",
            statePatches: [{ op: "setHard", key: "priceMax", value: 20000 }],
          }) }] },
        }],
      }),
    });
    await assert.rejects(
      () => provider(input),
      (error: unknown) =>
        (error as { code?: string; message?: string }).code === "schema_invalid" &&
        /statePatches/.test(String((error as { message?: string }).message))
    );
    delete process.env.GEMINI_API_KEY;
  });

  it("fails closed on malformed semantic JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createGeminiReasoningProvider({
      fetchImpl: jsonFetch({
        candidates: [{ content: { parts: [{ text: "{not-json" }] } }],
      }),
    });
    await assert.rejects(
      () => provider(input),
      (error: unknown) =>
        error instanceof ProviderFailureError && error.code === "malformed_json"
    );
    delete process.env.GEMINI_API_KEY;
  });
});

describe("Core v2 — reasoning prompt", () => {
  it("retains free reasoning, grounded context, and capability descriptions", () => {
    const prompt = buildReasoningUserPrompt({
      userTurn: "surask butus",
      history: [],
      stateSummary: "hard(user)=priceMax=150000",
      capabilities: ["searchListings(READ)"],
      groundedResults: ["searchListings: rasta 2 skelbimų: Butas A; Butas B"],
    });
    assert.match(prompt, /INTERPRETUOTA BŪSENA/);
    assert.match(prompt, /searchListings\(READ\)/);
    assert.match(prompt, /Butas A/);
    assert.match(CORE_V2_SYSTEM_INSTRUCTION, /Samprotavimas laisvas/);
  });
});
