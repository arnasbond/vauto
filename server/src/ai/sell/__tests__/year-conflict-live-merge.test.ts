/**
 * VAUTO AI Maturity — Phase 2B remediation: real year-conflict resolution,
 * proven through the actual live spec-patch merge path (`runVautoAgent`), not a
 * pure-policy simulation that artificially replaces facts/conflict state.
 *
 * Every scenario below chains real `runVautoAgent` turns: turn N's request uses
 * turn (N-1)'s actual returned `actions.listingDraft`, exactly like the real
 * client. No network/DB calls are exercised — the vehicle spec-patch branch this
 * suite targets returns deterministically before any Gemini/DB call, and
 * `authUserId` is intentionally left unset so the (DB-backed) preferences/
 * behavior-history prefetch never runs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent, resolveYearConflictPatch } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";

function baseAttributes(): Record<string, string> {
  return {
    make: "BMW",
    model: "320d",
    year: "2015",
    mileage: "150000",
    techInspection: "2025-01",
    transmission: "Automatinė",
    fuelType: "Dyzelinas",
    sellerType: "private",
  };
}

function baseDraft(attributes: Record<string, string> = baseAttributes()) {
  return {
    title: "BMW 320d",
    description: "BMW 320d 2015 m.",
    price: 9000,
    location: "Vilnius",
    category: "vehicles",
    attributes,
    listingFlowState: "DRAFT_READY" as const,
  };
}

function requestFor(
  listingDraft: ReturnType<typeof baseDraft>,
  userText: string
): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft,
    },
  };
}

function attrsOf(response: Awaited<ReturnType<typeof runVautoAgent>>): Record<string, string> {
  assert.equal(response.actions.type, "listing_draft");
  const draft = (response.actions as { listingDraft: { attributes?: Record<string, string> } })
    .listingDraft;
  return draft.attributes ?? {};
}

describe("Phase 2B remediation — resolveYearConflictPatch (pure state-transition unit)", () => {
  it("no prior conflict, no incoming year → no-op", () => {
    assert.deepEqual(resolveYearConflictPatch({ priorAttributes: { year: "2015" } }), {});
  });

  it("no prior conflict, fresh conflicting year → opens a new conflict, keeps A canonical", () => {
    const patch = resolveYearConflictPatch({
      priorAttributes: { year: "2015" },
      incomingYear: "2018",
    });
    assert.deepEqual(patch, { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" });
  });

  it("pending conflict, no incoming year (unrelated turn) → untouched", () => {
    const patch = resolveYearConflictPatch({
      priorAttributes: { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" },
    });
    assert.deepEqual(patch, {});
  });

  it("pending conflict, explicit choice of A → resolves to A, clears markers", () => {
    const patch = resolveYearConflictPatch({
      priorAttributes: { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" },
      incomingYear: "2015",
    });
    assert.deepEqual(patch, { year: "2015", yearConflict: "", yearConflictCandidate: "" });
  });

  it("pending conflict, explicit choice of B → resolves to B, clears markers", () => {
    const patch = resolveYearConflictPatch({
      priorAttributes: { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" },
      incomingYear: "2018",
    });
    assert.deepEqual(patch, { year: "2018", yearConflict: "", yearConflictCandidate: "" });
  });

  it("pending conflict, ambiguous third year → remains unresolved, discards the stray value", () => {
    const patch = resolveYearConflictPatch({
      priorAttributes: { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" },
      incomingYear: "2010",
    });
    assert.deepEqual(patch, { year: "2015", yearConflict: "true", yearConflictCandidate: "2018" });
  });
});

describe("Phase 2B remediation — year conflict through the real live spec-patch merge (runVautoAgent)", () => {
  it("1) year A exists; 2) incoming year B creates a conflict; 3) exactly one year clarification is asked", async () => {
    const response = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const attrs = attrsOf(response);
    assert.equal(attrs.year, "2015", "canonical year A must be preserved, never silently overwritten");
    assert.equal(attrs.yearConflict, "true");
    assert.equal(attrs.yearConflictCandidate, "2018");
    assert.match(
      response.reply,
      /Jei turite, parašykite: kuriuos pagaminimo metus laikyti teisingais —/,
      "exactly one year-clarification follow-up gap must be surfaced"
    );
    assert.doesNotMatch(response.reply, /ridą \(km\)|kainą|miestą/i, "no second question in the same turn");
  });

  it("4) user explicitly chooses A; 5) conflict markers are removed; 6) year is not asked again", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    assert.equal(attrsOf(turn1).yearConflict, "true");
    const draftAfterTurn1 = (turn1.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "2015"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.year, "2015");
    assert.equal(attrs2.yearConflict, undefined);
    assert.equal(attrs2.yearConflictCandidate, undefined);
    assert.doesNotMatch(turn2.reply, /pagaminimo metus laikyti teisingais/i);
    assert.match(turn2.reply, /PrePublish kortelėje/);

    // Turn 3 — an unrelated confirmation-style message must not resurrect the conflict.
    const draftAfterTurn2 = (turn2.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;
    const turn3 = await runVautoAgent(requestFor(draftAfterTurn2, "Rida dabar 151000 km"));
    const attrs3 = attrsOf(turn3);
    assert.equal(attrs3.year, "2015");
    assert.equal(attrs3.yearConflict, undefined);
    assert.equal(attrs3.mileage, "151000");
    assert.doesNotMatch(turn3.reply, /pagaminimo metus laikyti teisingais/i);
  });

  it("repeats the same proof for choosing B", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = (turn1.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "2018"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.year, "2018");
    assert.equal(attrs2.yearConflict, undefined);
    assert.equal(attrs2.yearConflictCandidate, undefined);
    assert.doesNotMatch(turn2.reply, /pagaminimo metus laikyti teisingais/i);
    assert.match(turn2.reply, /PrePublish kortelėje/);
  });

  it("an unrelated field update (mileage) while a conflict is pending preserves the unresolved conflict", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = (turn1.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "Rida dabar 160000 km"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.mileage, "160000", "the unrelated field must still be applied");
    assert.equal(attrs2.year, "2015", "canonical year A stays untouched");
    assert.equal(attrs2.yearConflict, "true", "conflict must survive an unrelated update");
    assert.equal(attrs2.yearConflictCandidate, "2018");
    assert.match(turn2.reply, /Jei turite, parašykite: kuriuos pagaminimo metus laikyti teisingais —/);
  });

  it("an ambiguous third year while a conflict is pending remains unresolved safely (never silently accepted)", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = (turn1.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "2010"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.year, "2015", "stray third year must never become canonical");
    assert.equal(attrs2.yearConflict, "true");
    assert.equal(attrs2.yearConflictCandidate, "2018", "the original disputed candidate must not be replaced by the stray value");
    assert.match(turn2.reply, /Jei turite, parašykite: kuriuos pagaminimo metus laikyti teisingais —/);
  });
});
