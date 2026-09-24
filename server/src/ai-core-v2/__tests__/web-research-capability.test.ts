/**
 * VAUTO AI Core v2 — World Research (webResearch) capability unit tests.
 *
 * Validates PR #102 requirements A-G & Atlas Remediation Requirements:
 * A. source URL survives into grounded evidence received by next reasoning pass
 * B. WEB_RESEARCH provenance survives structurally
 * C. query <3 and >200 fails validation
 * D. max result count remains <= 3
 * E. existing capability loop still works
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CapabilityRegistry, createMarketplaceRegistry } from "../capability/registry.js";
import { fetchBraveSearch, webResearchCapability } from "../capability/capabilities/web-research.js";
import { runMultiStepLoop } from "../loop/multi-step-loop.js";
import type { GroundedCapabilityResult, ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";

function input(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    userTurn: "kuris automobilis patikimesnis?",
    history: [],
    state: emptyMarketplaceState(),
    capabilities: createMarketplaceRegistry().describe(),
    ...over,
  };
}

describe("Core v2 — World Research (webResearch) capability", () => {
  it("Remediation A. source URL survives into grounded evidence received by the next reasoning pass", async () => {
    let capturedGrounded: GroundedCapabilityResult[] | undefined;
    const provider: ReasoningProvider = async (inp) => {
      if (!inp.groundedResults?.length) {
        return {
          capabilityRequest: {
            capability: "webResearch",
            args: { query: "Citroen Grand C4 Picasso reliability" },
          },
        };
      }
      capturedGrounded = inp.groundedResults;
      return { text: `Remiantis tyrimu: ${inp.groundedResults[0]?.summary}` };
    };

    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Citroen Grand C4 Picasso Review",
                url: "https://www.autocar.co.uk/car-review/citroen/grand-c4-picasso",
                description: "Good family car with minor electronics quirks.",
                page_age: "2026-01-15T00:00:00Z",
              },
            ],
          },
        }),
        { status: 200 }
      );

    const registry = new CapabilityRegistry();
    registry.register({
      name: webResearchCapability.name,
      description: webResearchCapability.description,
      operation: webResearchCapability.operation,
      validate: webResearchCapability.validate,
      execute: async (args) => {
        const res = await fetchBraveSearch(args.query, { apiKey: "test_key", fetchImpl: mockFetch });
        return { ok: res.ok, data: res.data, provenance: "TOOL_DERIVED" };
      },
    });

    const res = await runMultiStepLoop({ provider, registry, input: input() });
    assert.equal(res.iterations, 2);
    assert.ok(capturedGrounded && capturedGrounded.length > 0);
    const g = capturedGrounded[0];
    assert.ok(g?.summary?.includes("https://www.autocar.co.uk/car-review/citroen/grand-c4-picasso"));
    assert.equal(g?.sources?.[0]?.url, "https://www.autocar.co.uk/car-review/citroen/grand-c4-picasso");
  });

  it("Remediation B. WEB_RESEARCH provenance survives structurally", async () => {
    let capturedGrounded: GroundedCapabilityResult[] | undefined;
    const provider: ReasoningProvider = async (inp) => {
      if (!inp.groundedResults?.length) {
        return {
          capabilityRequest: {
            capability: "webResearch",
            args: { query: "Toyota RAV4 reliability" },
          },
        };
      }
      capturedGrounded = inp.groundedResults;
      return { text: "ok" };
    };

    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Toyota RAV4 Reliability Report",
                url: "https://www.whatcar.com/toyota/rav4/reliability",
                description: "Top rated hybrid SUV with very few engine faults.",
              },
            ],
          },
        }),
        { status: 200 }
      );

    const registry = new CapabilityRegistry();
    registry.register({
      name: webResearchCapability.name,
      description: webResearchCapability.description,
      operation: webResearchCapability.operation,
      validate: webResearchCapability.validate,
      execute: async (args) => {
        const res = await fetchBraveSearch(args.query, { apiKey: "test_key", fetchImpl: mockFetch });
        return { ok: res.ok, data: res.data, provenance: "TOOL_DERIVED" };
      },
    });

    await runMultiStepLoop({ provider, registry, input: input() });
    assert.ok(capturedGrounded && capturedGrounded.length > 0);
    const g = capturedGrounded[0];
    assert.ok(g?.sources && g.sources.length === 1);
    assert.equal(g.sources[0]?.provenanceTag, "WEB_RESEARCH");
    assert.equal(g.sources[0]?.source, "whatcar.com");
    assert.equal(g.sources[0]?.title, "Toyota RAV4 Reliability Report");
  });

  it("Remediation C. query <3 and >200 fails validation", () => {
    // Non-object args
    assert.throws(() => webResearchCapability.validate(null), /must be an object/);
    assert.throws(() => webResearchCapability.validate("query"), /must be an object/);

    // Non-string query
    assert.throws(() => webResearchCapability.validate({ query: 123 }), /requires a query string/);

    // Too short (< 3 characters)
    assert.throws(() => webResearchCapability.validate({ query: "ab" }), /at least 3 characters/);
    assert.throws(() => webResearchCapability.validate({ query: "  a  " }), /at least 3 characters/);

    // Too long (> 200 characters)
    const longQuery = "a".repeat(201);
    assert.throws(() => webResearchCapability.validate({ query: longQuery }), /must not exceed 200 characters/);

    // Valid bounds (3 to 200 chars)
    const valid3 = webResearchCapability.validate({ query: "abc" });
    assert.equal(valid3.query, "abc");

    const validTrim = webResearchCapability.validate({ query: "   valid query   " });
    assert.equal(validTrim.query, "valid query");

    const valid200 = webResearchCapability.validate({ query: "a".repeat(200) });
    assert.equal(valid200.query, "a".repeat(200));
  });

  it("Remediation D. max result count remains <= 3", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          web: {
            results: Array.from({ length: 10 }, (_, i) => ({
              title: `Result ${i + 1}`,
              url: `https://example.com/${i + 1}`,
              description: `Snippet ${i + 1}`,
            })),
          },
        }),
        { status: 200 }
      );

    // Requesting maxResults: 10 still caps at 3
    const res = await fetchBraveSearch("test query", { maxResults: 10, apiKey: "key", fetchImpl: mockFetch });
    assert.equal(res.ok, true);
    assert.equal(res.data?.count, 3);
    assert.equal(res.data?.sources.length, 3);
  });

  it("Remediation E. existing capability loop still works", async () => {
    const registry = createMarketplaceRegistry();
    assert.equal(registry.has("searchListings"), true);
    assert.equal(registry.has("listingDetails"), true);
    assert.equal(registry.has("webResearch"), true);

    const missingKeyRes = await fetchBraveSearch("test query", { apiKey: "" });
    assert.equal(missingKeyRes.ok, false);
    assert.equal(missingKeyRes.failureKind, "unavailable");
  });
});
