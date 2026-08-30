/**
 * VAUTO AI Maturity — Phase 2C: VIN provenance & explicit human confirmation
 * boundary.
 *
 * Layer: LIVE MERGE / INTEGRATION tests.
 *
 * Part A exercises the real chat-text spec-patch merge path through the actual
 * `runVautoAgent` entry point (same harness pattern as `year-conflict-live-merge.test.ts`)
 * — no network/DB calls; the vehicle spec-patch branch returns deterministically
 * before any Gemini/DB call, and `authUserId` is left unset so the DB-backed
 * prefetch never runs.
 *
 * Part B exercises the real `enrichVehicleListingDraftFromArgs` merge function
 * used by the `scanListingPhotos` (vision) and `postNewListing` (tool-args) live
 * call sites in `agent-tools.ts` — a pure function, tested directly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import { enrichVehicleListingDraftFromArgs } from "../../vehicle-attribute-extract.js";
import {
  deriveVinReviewState,
  type VinReviewStructuredAction,
} from "../../../vehicle/vin-review.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

function baseAttributes(extra: Record<string, string> = {}): Record<string, string> {
  return {
    make: "BMW",
    model: "320d",
    year: "2015",
    mileage: "150000",
    techInspection: "2025-01",
    transmission: "Automatinė",
    fuelType: "Dyzelinas",
    sellerType: "private",
    ...extra,
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
  userText: string,
  vinReviewAction?: VinReviewStructuredAction
): VautoAgentRequest {
  return {
    messages: [{ role: "user", text: userText }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      listingDraft,
      ...(vinReviewAction ? { vinReviewAction } : {}),
    },
  };
}

function attrsOf(response: Awaited<ReturnType<typeof runVautoAgent>>): Record<string, string> {
  assert.equal(response.actions.type, "listing_draft");
  const draft = (response.actions as { listingDraft: { attributes?: Record<string, string> } })
    .listingDraft;
  return draft.attributes ?? {};
}

function draftOf(response: Awaited<ReturnType<typeof runVautoAgent>>) {
  return (response.actions as { listingDraft: ReturnType<typeof baseDraft> }).listingDraft;
}

describe("Phase 2C live merge — chat text containing a bare VIN never becomes canonical (runVautoAgent)", () => {
  it("REQUIRED 3: a message that happens to contain a 17-char VIN-shaped token creates a candidate, not canonical vin", async () => {
    const response = await runVautoAgent(
      requestFor(baseDraft(), `VIN yra ${VALID_A}, prašau atnaujinti`)
    );
    const attrs = attrsOf(response);
    assert.equal(attrs.vin, undefined, "canonical vin must remain absent after mere chat-text extraction");
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinUncertain, "true");
    assert.equal(deriveVinReviewState(attrs).status, "candidate");
  });

  it("REQUIRED 9: a bare confirmation phrase alone (no embedded VIN) never confirms the pending candidate", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    assert.equal(attrsOf(turn1).vinCandidate, VALID_A);

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "taip, viskas tinka"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, undefined, "bare confirmation text must never promote the candidate to canonical");
    assert.equal(attrs2.vinCandidate, VALID_A, "candidate must survive an unrelated bare-confirmation turn");
  });

  it("REQUIRED 10: an exact VIN typed into chat text does not confirm — it stays a candidate", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, `✅ Patvirtinti VIN: ${VALID_A}`)
    );
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, undefined, "free-text exact-VIN input must never confirm");
    assert.equal(attrs2.vinCandidate, VALID_A, "the text only re-signals the same candidate");
    assert.equal(deriveVinReviewState(attrs2).status, "candidate");
  });

  it("an unrelated field update (mileage) while a VIN candidate is pending never disturbs it", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "Rida dabar 160000 km"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.mileage, "160000", "the unrelated field must still be applied");
    assert.equal(attrs2.vin, undefined);
    assert.equal(attrs2.vinCandidate, VALID_A, "the pending candidate must survive an unrelated update");
  });

  it("two disagreeing chat-text VIN mentions across turns open a conflict, no silent winner", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, `${VALID_B}`));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, undefined);
    assert.equal(attrs2.vinConflict, "true");
    assert.equal(attrs2.vinConflictValue, VALID_B);
    const state = deriveVinReviewState(attrs2);
    assert.equal(state.status, "conflict");
  });

  it("a previously CONFIRMED vin surviving into a new draft turn is preserved (idempotent, no regression to candidate)", async () => {
    const confirmedDraft = baseDraft(
      baseAttributes({
        vin: VALID_A,
        vinConfirmed: "true",
        vinConfirmedSource: "user_entered",
        vinConfirmedReviewId: "vr_confirmed_1",
      })
    );
    const response = await runVautoAgent(requestFor(confirmedDraft, "Rida dabar 155000 km"));
    const attrs = attrsOf(response);
    assert.equal(attrs.vin, VALID_A, "an already-confirmed vin must remain canonical across unrelated turns");
    assert.equal(attrs.vinCandidate, undefined);
    assert.equal(deriveVinReviewState(attrs).status, "confirmed");
  });
});

describe("Phase 2C live merge — trusted structured vinReviewAction through runVautoAgent", () => {
  it("REQUIRED 8: explicit UI confirm action (exact value + current reviewId) promotes the candidate and replies with success", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");
    assert.ok(reviewId, "live candidate must mint a review generation");

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "confirm",
        value: VALID_A,
        reviewId,
      })
    );
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, VALID_A);
    assert.equal(attrs2.vinConfirmed, "true");
    assert.equal(attrs2.vinCandidate, undefined);
    assert.match(turn2.reply, /patvirtintas/i);
  });

  it("REQUIRED 13/18: a stale confirm (old reviewId) is a safe no-op and never produces a success reply", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    // The live candidate moves on to B (fresh generation) via a correct action.
    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId,
      })
    );
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vinCandidate, VALID_B);

    // Now a confirm bound to the OLD generation/value must not confirm anything.
    const turn3 = await runVautoAgent(
      requestFor(draftOf(turn2), "VIN peržiūros veiksmas", {
        type: "confirm",
        value: VALID_A,
        reviewId,
      })
    );
    const attrs3 = attrsOf(turn3);
    assert.equal(attrs3.vin, undefined, "stale confirm must never promote a value");
    assert.equal(attrs3.vinCandidate, VALID_B, "the current candidate must survive the stale confirm");
    assert.doesNotMatch(turn3.reply, /patvirtintas/i, "a stale action must never claim success");
    assert.match(turn3.reply, /nebegalioja/i);
  });

  it("REQUIRED 14: a stale reject (old reviewId) is a safe no-op and never produces a rejection reply", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId,
      })
    );
    const turn3 = await runVautoAgent(
      requestFor(draftOf(turn2), "VIN peržiūros veiksmas", {
        type: "reject",
        reviewId,
      })
    );
    const attrs3 = attrsOf(turn3);
    assert.equal(attrs3.vinCandidate, VALID_B, "stale reject must not clear the newer candidate");
    assert.doesNotMatch(turn3.reply, /nefiksuoju/i);
  });

  it("REQUIRED 12: a correct action replaces the candidate with a fresh generation but does not confirm", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId,
      })
    );
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, undefined, "correction alone must not become canonical");
    assert.equal(attrs2.vinCandidate, VALID_B);
    assert.equal(attrs2.vinCandidateSource, "user_entered");
    assert.notEqual(attrs2.vinReviewId, reviewId, "correction must mint a fresh generation");
    assert.match(turn2.reply, /atnaujintas/i);
  });

  it("REQUIRED 15: a correct action bound to a stale generation never clobbers the current candidate", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId,
      })
    );
    const staleCorrect = await runVautoAgent(
      requestFor(draftOf(turn2), "VIN peržiūros veiksmas", {
        type: "correct",
        value: "1HGCM82633A004352",
        reviewId,
      })
    );
    const attrs3 = attrsOf(staleCorrect);
    assert.equal(attrs3.vinCandidate, VALID_B, "stale correct must not clobber the newer candidate");
    assert.doesNotMatch(staleCorrect.reply, /atnaujintas/i);
  });

  it("REQUIRED 18: a confirm for a draft with no pending review returns a not_found reply, never success", async () => {
    const response = await runVautoAgent(
      requestFor(baseDraft(), "VIN peržiūros veiksmas", {
        type: "confirm",
        value: VALID_A,
        reviewId: "vr_nothing",
      })
    );
    const attrs = attrsOf(response);
    assert.equal(attrs.vin, undefined);
    assert.doesNotMatch(response.reply, /patvirtintas/i);
  });

  it("REQUIRED 16: A→B→A generation protection — matching VIN text alone is never sufficient", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const idA = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId: idA,
      })
    );
    assert.equal(attrsOf(turn2).vinCandidate, VALID_B);

    // Identical VIN text A re-appears as plain chat — it must NOT restore A's
    // generation or overwrite the B candidate; it can only open a conflict.
    const turn3 = await runVautoAgent(requestFor(draftOf(turn2), `${VALID_A}`));
    const attrs3 = attrsOf(turn3);
    assert.equal(attrs3.vin, undefined);
    assert.equal(deriveVinReviewState(attrs3).status, "conflict");
  });

  it("replaying the same structured confirm request twice is deterministic and idempotent", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `${VALID_A}`));
    const draftAfterTurn1 = draftOf(turn1);
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    const confirmRequest = requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
      type: "confirm",
      value: VALID_A,
      reviewId,
    });
    const once = await runVautoAgent(confirmRequest);
    const replay = await runVautoAgent(confirmRequest);
    assert.equal(attrsOf(once).vin, VALID_A);
    assert.equal(attrsOf(replay).vin, VALID_A);
  });
});

describe("Phase 2C live merge — enrichVehicleListingDraftFromArgs (scanListingPhotos / postNewListing merge function)", () => {
  it("REQUIRED 1/2: a vision-style fresh VIN extraction (freshVinExtraction) never lands directly on attributes.vin", () => {
    const result = enrichVehicleListingDraftFromArgs(
      "BMW 320d",
      "Automobilis parduodamas",
      "vehicles",
      {},
      { vinSource: "photo_ocr", freshVinExtraction: VALID_A }
    );
    assert.equal(result.attributes.vin, undefined);
    assert.equal(result.attributes.vinCandidate, VALID_A);
    assert.equal(result.attributes.vinCandidateSource, "photo_ocr");
    assert.equal(deriveVinReviewState(result.attributes).status, "candidate");
  });

  it("a fresh vision VIN disagreeing with the prior confirmed vin opens a conflict, never overwrites canonical", () => {
    const result = enrichVehicleListingDraftFromArgs(
      "BMW 320d",
      "Automobilis parduodamas",
      "vehicles",
      { vin: VALID_A, vinConfirmed: "true", vinConfirmedSource: "user_entered", vinConfirmedReviewId: "vr_1" },
      { vinSource: "photo_ocr", freshVinExtraction: VALID_B }
    );
    assert.equal(result.attributes.vin, VALID_A, "prior confirmed vin must survive a disagreeing rescan");
    assert.equal(result.attributes.vinConflictValue, VALID_B);
    assert.equal(deriveVinReviewState(result.attributes).status, "conflict");
  });

  it("a bare VIN-shaped token embedded in the title/description text alone (no vision signal) still only becomes a candidate", () => {
    const result = enrichVehicleListingDraftFromArgs(
      "BMW 320d",
      `Techninis pasas rodo VIN ${VALID_A}, viskas tvarkoje`,
      "vehicles",
      {}
    );
    assert.equal(result.attributes.vin, undefined);
    assert.equal(result.attributes.vinCandidate, VALID_A);
  });

  it("non-vehicle categories are never touched by the VIN reducer (defensive no-op for family gate)", () => {
    const result = enrichVehicleListingDraftFromArgs(
      "iPhone 13",
      "Naudotas telefonas",
      "electronics",
      { vin: "shouldnt matter" }
    );
    assert.equal(result.category, "electronics");
    assert.equal(result.attributes.vin, "shouldnt matter", "non-vehicle family is an explicit early return, untouched");
  });
});
