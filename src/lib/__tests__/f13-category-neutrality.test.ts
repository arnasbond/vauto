/**
 * F1.3 — category neutrality + AI-down messaging (client side).
 *
 * No jsdom/React: pure logic modules the browser bundle loads.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { resolvePrimaryVehicle } from "@/lib/zero-ui-defaults";
import { findNewFleetMatches } from "@/lib/fleet-listing-match";
import { buddyMessageForAgentFailure } from "@/lib/voice-graceful";
import type { Listing } from "@/lib/types";

function listing(over: Partial<Listing>): Listing {
  return {
    id: over.id ?? "l1",
    title: over.title ?? "BMW 320d dalys",
    description: over.description ?? "",
    price: over.price ?? 50,
    category: over.category ?? "vehicles",
    location: over.location ?? "Vilnius",
    tags: over.tags ?? [],
    status: over.status ?? "active",
    banned: over.banned ?? false,
    ...over,
  } as Listing;
}

describe("F1.3 category neutrality — manual fallback draft", () => {
  it("'siuvimo mašina' with a non-vehicle category stays non-vehicle", () => {
    const draft = createManualFallbackDraft({
      category: "clothing",
      transcript: "parduodu siuvimo mašiną, veikia gerai",
      location: "Kaunas",
      contact: "",
    });
    assert.equal(draft.category, "clothing");
    assert.ok(!(draft.description ?? "").includes("automobilis"), "no vehicle boilerplate");
    assert.ok(!draft.title.includes("automobilis"));
    assert.equal(draft.attributes?.make, undefined);
  });

  it("explicit vehicle category still drafts a vehicle listing (regression)", () => {
    const draft = createManualFallbackDraft({
      category: "vehicles",
      transcript: "parduodu bmw 320d",
      location: "Kaunas",
      contact: "",
    });
    assert.equal(draft.category, "vehicles");
    assert.ok(/bmw/i.test(String(draft.attributes?.make ?? "")), "make extracted");
    assert.ok((draft.description ?? "").includes("automobilis"));
  });

  it("no synthetic fleet: resolvePrimaryVehicle(null) is null", () => {
    assert.equal(resolvePrimaryVehicle(null), null);
    assert.deepEqual(
      resolvePrimaryVehicle({ make: "Volvo", model: "V70", year: 2006 }),
      { make: "Volvo", model: "V70", year: 2006 }
    );
  });

  it("fleet matching is inert without a saved vehicle", () => {
    const matches = findNewFleetMatches([listing({})], new Set(), null, "Vilnius");
    assert.deepEqual(matches, []);
  });
});

describe("F1.3 AI-down messaging — manual mode stays visible", () => {
  it("agent_unavailable message points to manual mode", () => {
    const msg = buddyMessageForAgentFailure(undefined, "agent_unavailable");
    assert.ok(msg.includes("nepasiekiamas"));
    assert.ok(msg.includes("rankiniu būdu"));
    assert.ok(msg.includes("paieška"));
  });

  it("gemini_error code uses the same honest AI-down message", () => {
    const msg = buddyMessageForAgentFailure("Gemini 502", "gemini_error");
    assert.ok(msg.includes("nepasiekiamas"));
  });

  it("timeout message keeps manual mode available", () => {
    const msg = buddyMessageForAgentFailure(undefined, "timeout");
    assert.ok(msg.includes("rankiniu būdu"));
  });
});
