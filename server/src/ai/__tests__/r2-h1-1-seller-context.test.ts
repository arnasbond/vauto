/**
 * R2-H1.1 — seller/business context must not leak into buyer turns.
 *
 * The listings summary and the supervisor monetization rules are DATA/policy
 * surfaces, not instruction channels. A business/admin role alone must never
 * inject seller coaching (AI Derybininkas, Smart Boost, minimal price) into an
 * unrelated buyer advisory turn. Seller proactive behavior stays available
 * through the topic-scoped business rules.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeMyListings } from "../user-agent-context.js";
import { buildSupervisorSystemInstruction } from "../supervisor-system-instruction.js";

describe("R2-H1.1 — listings summary is a fact, not seller coaching", () => {
  it("business empty-listings summary carries no seller coaching", () => {
    const summary = summarizeMyListings([], "Jonas", "business");
    assert.equal(summary, "Neturi aktyvių skelbimų.");
    assert.ok(!/proaktyviai|Smart Boost|leadus|Derybinink/i.test(summary), "no seller coaching in the fact summary");
  });

  it("buyer empty-listings summary carries no imperative seller task", () => {
    const summary = summarizeMyListings([], "Jonas", "buyer");
    assert.match(summary, /Spinta tuščia/i);
    assert.ok(!/proaktyviai paskatink|nufotografuoti|paruošti skelbimą/i.test(summary), "no imperative seller task");
  });
});

describe("R2-H1.1 — supervisor monetization rules exclude buyer advisory", () => {
  it("AI Derybininkas/min-price suggestion is gated on non-buyer turns", () => {
    const system = buildSupervisorSystemInstruction();
    assert.match(system, /pirkimo patarimas/i);
    assert.match(system, /NEsiūlyk derybininko/i);
  });
});
