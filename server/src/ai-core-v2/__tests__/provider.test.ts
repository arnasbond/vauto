/**
 * VAUTO AI Core v2 — real Gemini provider: parses untrusted structured output
 * into a ReasoningDecision; the system instruction is compact and principle-based
 * (no legacy intent routing / regex / phrase cages).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReasoningDecision, REASONING_DECISION_SCHEMA } from "../provider/schema.js";
import { CORE_V2_SYSTEM_INSTRUCTION, buildReasoningUserPrompt } from "../provider/prompt.js";
import { createGeminiReasoningProvider, ProviderFailureError } from "../provider/gemini-provider.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";

describe("Core v2 — reasoning schema parser", () => {
  it("parses a composable decision", () => {
    const d = parseReasoningDecision({
      text: "patarimas",
      clarification: "kuris tipas?",
      capabilityRequest: { capability: "searchListings", args: { query: "butas" } },
      statePatches: [
        { op: "setHard", key: "priceMax", value: 150000, provenance: { source: "USER_STATED" } },
        { op: "addSoft", label: "saugus", provenance: { source: "MODEL_INFERRED", confidence: 0.6 } },
      ],
    });
    assert.equal(d.text, "patarimas");
    assert.equal(d.clarification, "kuris tipas?");
    assert.equal(d.capabilityRequest?.capability, "searchListings");
    assert.equal(d.statePatches?.length, 2);
  });

  it("unknown provenance source falls back to MODEL_INFERRED", () => {
    const d = parseReasoningDecision({
      statePatches: [{ op: "setHard", key: "priceMax", value: 1, provenance: { source: "NOPE" } }],
    });
    const patch = d.statePatches?.[0] as { provenance?: { source?: string } } | undefined;
    assert.equal(patch?.provenance?.source, "MODEL_INFERRED");
  });

  it("unknown patch op throws (malformed)", () => {
    assert.throws(() => parseReasoningDecision({ statePatches: [{ op: "bogus" }] }), /unknown patch op/);
  });
});

describe("Core v2 — prompt is compact and principle-based", () => {
  it("system instruction contains no legacy intent regex vocabulary", () => {
    assert.doesNotMatch(CORE_V2_SYSTEM_INSTRUCTION, /EXECUTION_DIRECTIVE|SEARCH_VERB|forceCatalogSearch|fromSearchBar/);
  });
  it("system instruction states the doctrine", () => {
    assert.match(CORE_V2_SYSTEM_INSTRUCTION, /Samprotavimas laisvas/);
    assert.match(CORE_V2_SYSTEM_INSTRUCTION, /NIEKADA/);
  });
  it("user prompt assembles turn + state + capabilities + grounded results", () => {
    const p = buildReasoningUserPrompt({
      userTurn: "surask butus",
      history: [],
      stateSummary: "hard(user)=priceMax=150000",
      capabilities: ["searchListings(READ)"],
      groundedResults: ["searchListings: rasta 2 skelbimų: Butas A; Butas B"],
    });
    assert.match(p, /INTERPRETUOTA BŪSENA/);
    assert.match(p, /searchListings\(READ\)/);
    assert.match(p, /Butas A/);
  });
});

describe("Core v2 — Gemini provider", () => {
  it("returns a parsed decision from structured JSON output", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ text: "Štai variantai" }) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;
    const provider = createGeminiReasoningProvider({ fetchImpl });
    process.env.GEMINI_API_KEY = "test-key";
    const d = await provider({
      userTurn: "surask butus",
      history: [],
      state: emptyMarketplaceState(),
      capabilities: [{ name: "searchListings", description: "x", consequence: "READ" }],
    });
    assert.equal(d?.text, "Štai variantai");
    delete process.env.GEMINI_API_KEY;
  });

  it("empty structured output yields an empty (no-tool) decision", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "" }] } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const provider = createGeminiReasoningProvider({ fetchImpl });
    process.env.GEMINI_API_KEY = "test-key";
    const d = await provider({
      userTurn: "labas",
      history: [],
      state: emptyMarketplaceState(),
      capabilities: [],
    });
    assert.deepEqual(d, {});
    delete process.env.GEMINI_API_KEY;
  });

  it("exposes a structured response schema", () => {
    assert.equal(REASONING_DECISION_SCHEMA.type, "object");
    assert.ok(REASONING_DECISION_SCHEMA.properties.statePatches);
  });
});

describe("Core v2.2A — provider failure taxonomy", () => {
  const inp = {
    userTurn: "labas",
    history: [],
    state: emptyMarketplaceState(),
    capabilities: [],
  };

  function jsonFetch(body: unknown, status = 200): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  }

  it("API-key unavailable → provider_unavailable", async () => {
    delete process.env.GEMINI_API_KEY;
    const provider = createGeminiReasoningProvider({ fetchImpl: jsonFetch({}) });
    await assert.rejects(() => provider(inp), (e: Error) => e.message.includes("not configured"));
  });

  it("HTTP non-2xx → http_error", async () => {
    process.env.GEMINI_API_KEY = "test";
    const provider = createGeminiReasoningProvider({ fetchImpl: jsonFetch({}, 500) });
    await assert.rejects(() => provider(inp), (e: Error) => /Gemini HTTP 500/.test(e.message));
    delete process.env.GEMINI_API_KEY;
  });

  it("malformed JSON → malformed_json", async () => {
    process.env.GEMINI_API_KEY = "test";
    const provider = createGeminiReasoningProvider({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    await assert.rejects(() => provider(inp), (e: Error) => e.message.includes("valid JSON"));
    delete process.env.GEMINI_API_KEY;
  });

  it("schema-invalid output → schema_invalid", async () => {
    process.env.GEMINI_API_KEY = "test";
    const provider = createGeminiReasoningProvider({
      fetchImpl: jsonFetch({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ statePatches: [{ op: "bogus" }] }) }] } }],
      }),
    });
    await assert.rejects(
      () => provider(inp),
      (e: unknown) => e instanceof ProviderFailureError && e.code === "schema_invalid"
    );
    delete process.env.GEMINI_API_KEY;
  });
});
