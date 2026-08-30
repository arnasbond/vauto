/**
 * VAUTO AI Maturity — Phase 2D: trusted draft-state round-trip preservation.
 *
 * This suite proves the REAL client↔server seam for draft-state markers:
 * every turn-N response is passed through the ACTUAL client category sanitizer
 * (`sanitizeAttributesForCategory`, imported dynamically from the client source
 * — the same code the browser bundle runs) before being sent as turn (N+1)'s
 * `context.listingDraft`, exactly like the live client round-trip.
 *
 * Pre-2D, the client sanitizer silently stripped every VIN review draft marker
 * and the year-conflict markers, so:
 *   - a structured VIN confirm on turn 2 failed closed (`not_found`) although a
 *     candidate existed;
 *   - a year conflict could never be resolved by choosing the candidate value;
 *   - a confirmed VIN was silently downgraded and replaced by a later differing
 *     extraction with no conflict prompt.
 *
 * Runtime note: the client file's `@/…` / `@vauto/shared/…` aliases resolve via
 * the repo-root tsconfig paths (or the mirrored paths in server/tsconfig.json)
 * when tsx loads it; the dynamic-import seam keeps the client source out of the
 * server typecheck program (no directory-import TS2835 under NodeNext).
 *
 * No network / DB calls: the deterministic spec-patch and structured-VIN
 * branches return before any Gemini/DB work; `authUserId` stays unset.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import {
  deriveVinReviewState,
  redactVinReviewForModel,
  UNTRUSTED_VIN_MARKER_KEYS,
  stripUntrustedVinMarkers,
} from "../../../shared/vin-review.js";
import { sanitizeListingAttributesForPersistence } from "../../../shared/listing-attributes-sanitize.js";
import { slimListingDraftForLlm } from "../../../shared/llm-context-slice.js";
import {
  ensureVinReviewChallenge,
  consumeVinChallenge,
  resetVinChallengeBoundaryForTests,
} from "../../../vehicle/vin-challenge.js";
import {
  buildConfirmedVinAttributesPatch,
  finalizeCreateVinAuthority,
  verifyVinConfirmation,
  __vinConfirmationTestSecrets,
} from "../../../vehicle/vin-confirmation.js";
import {
  applyVinStructuredReviewAction,
  type VinReviewStructuredAction,
} from "../../../vehicle/vin-review.js";
import { normalizeVin } from "../../../shared/vin-utils.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

/** The 12 Phase 2D draft-state keys (10 VIN review + 2 year-conflict). */
const VIN_DRAFT_STATE_KEYS = [
  "vinCandidate",
  "vinCandidateSource",
  "vinCandidateConfidence",
  "vinConflict",
  "vinConflictValue",
  "vinConflictSource",
  "vinUncertain",
  "vinReviewId",
  "vinConfirmed",
  "vinConfirmedSource",
] as const;

const YEAR_CONFLICT_KEYS = ["yearConflict", "yearConflictCandidate"] as const;

const TRANSPORT_KEYS = [
  "vinChallenge",
  "vinDraftScope",
  "vinConfirmedReviewId",
  "vinConfirmationReceipt",
  "vinConfirmationIssuedAt",
  "vinConfirmationExpiresAt",
] as const;

const ALL_DRAFT_MARKER_KEYS = new Set<string>([
  ...VIN_DRAFT_STATE_KEYS,
  ...YEAR_CONFLICT_KEYS,
]);

/** The REAL client category sanitizer, loaded from the client source tree. */
const clientSanitizerUrl = new URL(
  "../../../../../src/lib/listing-attribute-isolation.ts",
  import.meta.url
).href;

let sanitizeAttributesForCategory: (
  category: string,
  attributes: Record<string, string | string[] | undefined>,
  incoming?: Record<string, string | string[] | undefined>
) => Record<string, string | string[] | undefined>;

beforeEach(async () => {
  resetVinChallengeBoundaryForTests();
  __vinConfirmationTestSecrets("test-vin-confirm-secret-phase2d");
  if (!sanitizeAttributesForCategory) {
    const mod = (await import(clientSanitizerUrl)) as {
      sanitizeAttributesForCategory: typeof sanitizeAttributesForCategory;
    };
    sanitizeAttributesForCategory = mod.sanitizeAttributesForCategory;
  }
});

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

/** The real client round-trip: attributes pass through sanitizeAttributesForCategory. */
function clientRoundTrip(draft: ReturnType<typeof baseDraft>) {
  return {
    ...draft,
    attributes: sanitizeAttributesForCategory(
      draft.category,
      {},
      draft.attributes as Record<string, string | string[] | undefined>
    ) as Record<string, string>,
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

describe("Phase 2D — client sanitizer preserves the draft-state markers (client source, real sanitizer)", () => {
  it("all 10 VIN review draft-state keys survive the real client sanitizer for a vehicle draft", () => {
    const draft = baseDraft(
      baseAttributes({
        vinCandidate: VALID_A,
        vinCandidateSource: "photo_ocr",
        vinCandidateConfidence: "0.9",
        vinConflict: "true",
        vinConflictValue: VALID_B,
        vinConflictSource: "user_entered",
        vinUncertain: "true",
        vinReviewId: "vr_agent_1",
        vinConfirmed: "true",
        vinConfirmedSource: "user_entered",
      })
    );
    const attrs = clientRoundTrip(draft).attributes;
    for (const key of VIN_DRAFT_STATE_KEYS) {
      assert.ok(String(attrs[key] ?? "").length > 0, `${key} must survive the client round-trip`);
    }
  });

  it("both year-conflict keys survive the real client sanitizer", () => {
    const draft = baseDraft(baseAttributes({ yearConflict: "true", yearConflictCandidate: "2018" }));
    const attrs = clientRoundTrip(draft).attributes;
    assert.equal(attrs.yearConflict, "true");
    assert.equal(attrs.yearConflictCandidate, "2018");
  });

  it("vinReviewState is dropped by the real client sanitizer", () => {
    const draft = baseDraft(baseAttributes({ vinReviewState: "pending_human_review" }));
    const attrs = clientRoundTrip(draft).attributes;
    assert.equal(attrs.vinReviewState, undefined);
  });

  it("unrelated unknown attributes are still dropped by the real client sanitizer", () => {
    const draft = baseDraft(baseAttributes({ bogusInternalDump: "nope" }));
    const attrs = clientRoundTrip(draft).attributes;
    assert.equal(attrs.bogusInternalDump, undefined);
  });
});

describe("Phase 2D — AC1/AC2: real two-turn structured VIN confirmation through the client seam", () => {
  it("AC1 (agent turn): turn-2 structured confirm applies after the client round-trip (never not_found)", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `VIN yra ${VALID_A}, prašau atnaujinti`));
    const draftAfterTurn1 = clientRoundTrip(draftOf(turn1));
    const reviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");
    assert.ok(reviewId, "candidate must survive the round-trip with its review generation");
    assert.equal(draftAfterTurn1.attributes?.vinCandidate, VALID_A);

    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "confirm",
        value: VALID_A,
        reviewId,
      })
    );
    const attrs2 = attrsOf(turn2);
    assert.doesNotMatch(turn2.reply, /nėra laukiančio/i, "result must never be not_found");
    assert.match(turn2.reply, /patvirtintas/i);
    assert.equal(attrs2.vin, VALID_A, "canonical vin must be promoted");
    assert.equal(attrs2.vinConfirmed, "true");
    assert.equal(attrs2.vinCandidate, undefined);
    assert.equal(deriveVinReviewState(attrs2).status, "confirmed");
  });

  it("AC1 (receipt boundary): the sanitized candidate mints a verified server receipt through the exact handler chain", () => {
    // Execute the exact sequence of vauto-agent.ts:1129–1165 for an
    // authenticated confirm — ensureVinReviewChallenge → consumeVinChallenge →
    // buildConfirmedVinAttributesPatch → re-apply reducer — against the REAL
    // client-sanitized prior attributes. (The runVautoAgent seam above skips
    // this chain because the test harness leaves `authUserId` unset to avoid
    // the DB-backed preferences prefetch; the chain itself is DB-free.)
    const sanitized = clientRoundTrip(
      baseDraft(
        baseAttributes({
          vinCandidate: VALID_A,
          vinCandidateSource: "user_entered",
          vinUncertain: "true",
          vinReviewId: "vr_seam_1",
        })
      )
    ).attributes as Record<string, string>;

    const ensured = ensureVinReviewChallenge(sanitized, { userId: "user-phase2d" });
    assert.ok(String(ensured.vinChallenge ?? "").length > 0, "a server challenge must be registered");
    assert.ok(String(ensured.vinDraftScope ?? "").length > 0, "a server draft scope must be minted");

    const consumed = consumeVinChallenge(
      {
        challengeId: String(ensured.vinChallenge ?? "").trim(),
        userId: "user-phase2d",
        vin: normalizeVin(VALID_A),
        draftScope: String(ensured.vinDraftScope ?? "").trim() || undefined,
      },
      ({ userId, vin, reviewId, draftScope, challengeId }) =>
        buildConfirmedVinAttributesPatch({
          userId,
          vin,
          reviewId,
          draftScope,
          challengeId,
        })
    );
    assert.equal(consumed.ok, true, "the challenge must be consumable");
    assert.ok(consumed.attrs, "consumption must return the receipt patch");
    const receipt = String(consumed.attrs.vinConfirmationReceipt ?? "");
    assert.ok(receipt.length > 0, "a server HMAC receipt must be minted");

    const reduction = applyVinStructuredReviewAction(ensured, {
      type: "confirm",
      value: VALID_A,
      reviewId: String(ensured.vinReviewId ?? ""),
    });
    assert.equal(reduction.outcome, "applied");
    const nextAttrs = { ...reduction.attrs, ...consumed.attrs };
    assert.equal(nextAttrs.vin, VALID_A);
    assert.equal(nextAttrs.vinConfirmed, "true");

    const verified = verifyVinConfirmation({
      userId: "user-phase2d",
      vin: VALID_A,
      reviewId: String(ensured.vinReviewId ?? ""),
      draftScope: String(ensured.vinDraftScope ?? "").trim() || undefined,
      receipt: String(nextAttrs.vinConfirmationReceipt ?? ""),
      issuedAt: String(nextAttrs.vinConfirmationIssuedAt ?? ""),
      expiresAt: String(nextAttrs.vinConfirmationExpiresAt ?? ""),
    });
    assert.equal(verified.ok, true, "the minted receipt must verify");

    const finalized = finalizeCreateVinAuthority(
      nextAttrs as Record<string, string | string[] | undefined>,
      "user-phase2d"
    );
    assert.equal(finalized.vin, VALID_A, "a verified receipt is the ONLY authority that persists the VIN");
  });

  it("AC2: a stale reviewId fails closed across the client round-trip (no receipt, state preserved)", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), `VIN yra ${VALID_A}, prašau atnaujinti`));
    const draftAfterTurn1 = clientRoundTrip(draftOf(turn1));
    const staleReviewId = String(draftAfterTurn1.attributes?.vinReviewId ?? "");

    // Fresh generation via a correct action (through the seam again).
    const turn2 = await runVautoAgent(
      requestFor(draftAfterTurn1, "VIN peržiūros veiksmas", {
        type: "correct",
        value: VALID_B,
        reviewId: staleReviewId,
      })
    );
    const draftAfterTurn2 = clientRoundTrip(draftOf(turn2));
    assert.equal(draftAfterTurn2.attributes?.vinCandidate, VALID_B);

    const turn3 = await runVautoAgent(
      requestFor(draftAfterTurn2, "VIN peržiūros veiksmas", {
        type: "confirm",
        value: VALID_A,
        reviewId: staleReviewId,
      })
    );
    const attrs3 = attrsOf(turn3);
    assert.equal(attrs3.vin, undefined, "stale confirm must never promote a value");
    assert.equal(attrs3.vinCandidate, VALID_B, "the current candidate must survive");
    assert.equal(attrs3.vinConfirmationReceipt, undefined, "no receipt may be minted");
    assert.doesNotMatch(turn3.reply, /patvirtintas/i);
    assert.match(turn3.reply, /nebegalioja/i);
  });
});

describe("Phase 2D — AC3/AC4/AC5: year conflict across the client round-trip", () => {
  it("AC3: choosing the original value A resolves the conflict and clears the markers", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = clientRoundTrip(draftOf(turn1));
    assert.equal(draftAfterTurn1.attributes?.yearConflict, "true");
    assert.equal(draftAfterTurn1.attributes?.yearConflictCandidate, "2018");

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "2015"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.year, "2015");
    assert.equal(attrs2.yearConflict, undefined);
    assert.equal(attrs2.yearConflictCandidate, undefined);
    assert.doesNotMatch(turn2.reply, /pagaminimo metus laikyti teisingais/i);
  });

  it("AC4: choosing the candidate value B resolves the conflict (no loop)", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = clientRoundTrip(draftOf(turn1));

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "2018"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.year, "2018", "canonical year must become the candidate value");
    assert.equal(attrs2.yearConflict, undefined, "the conflict must not be recreated");
    assert.equal(attrs2.yearConflictCandidate, undefined);
    assert.doesNotMatch(turn2.reply, /pagaminimo metus laikyti teisingais/i);
  });

  it("AC5: an unrelated turn preserves the pending conflict through the round-trip", async () => {
    const turn1 = await runVautoAgent(requestFor(baseDraft(), "2018"));
    const draftAfterTurn1 = clientRoundTrip(draftOf(turn1));

    const turn2 = await runVautoAgent(requestFor(draftAfterTurn1, "Rida dabar 160000 km"));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.mileage, "160000", "the unrelated field must still be applied");
    assert.equal(attrs2.year, "2015");
    assert.equal(attrs2.yearConflict, "true", "the pending conflict must survive an unrelated turn");
    assert.equal(attrs2.yearConflictCandidate, "2018");
    assert.match(turn2.reply, /pagaminimo metus laikyti teisingais/i, "the open conflict keeps surfacing");
  });
});

describe("Phase 2D — AC6: confirmed VIN stability across the client round-trip", () => {
  it("a confirmed VIN is never silently downgraded — a differing extraction opens a conflict", async () => {
    const confirmed = baseDraft(
      baseAttributes({
        vin: VALID_A,
        vinConfirmed: "true",
        vinConfirmedSource: "user_entered",
        vinConfirmedReviewId: "vr_confirmed_1",
      })
    );
    const draftAfterRoundTrip = clientRoundTrip(confirmed);
    assert.equal(draftAfterRoundTrip.attributes?.vinConfirmed, "true");
    assert.equal(deriveVinReviewState(draftAfterRoundTrip.attributes ?? {}).status, "confirmed");

    const turn2 = await runVautoAgent(requestFor(draftAfterRoundTrip, `VIN yra ${VALID_B}`));
    const attrs2 = attrsOf(turn2);
    assert.equal(attrs2.vin, VALID_A, "the human-confirmed canonical VIN must remain intact");
    assert.equal(attrs2.vinConflict, "true");
    assert.equal(attrs2.vinConflictValue, VALID_B);
    const state = deriveVinReviewState(attrs2);
    assert.equal(state.status, "conflict", "a differing extraction must become an explicit conflict");
  });
});

describe("Phase 2D — AC7/AC8/AC9: persistence strip, model privacy, ingress stripping", () => {
  const dirtyAttributes = (): Record<string, string> => ({
    make: "BMW",
    model: "320d",
    year: "2015",
    vin: VALID_A,
    vinCandidate: VALID_A,
    vinCandidateSource: "photo_ocr",
    vinCandidateConfidence: "0.9",
    vinConflict: "true",
    vinConflictValue: VALID_B,
    vinConflictSource: "user_entered",
    vinUncertain: "true",
    vinReviewId: "vr_1",
    vinConfirmed: "true",
    vinConfirmedSource: "user_entered",
    vinReviewState: "pending_human_review",
    yearConflict: "true",
    yearConflictCandidate: "2018",
    vinChallenge: "vc_1",
    vinDraftScope: "vs_1",
    vinConfirmedReviewId: "vr_1",
    vinConfirmationReceipt: "deadbeef",
    vinConfirmationIssuedAt: "1700000000",
    vinConfirmationExpiresAt: "1700003600",
  });

  it("AC7: the persistence sanitizer strips all 12 draft-state markers, vinReviewState, and keeps safe attrs", () => {
    const out = sanitizeListingAttributesForPersistence(dirtyAttributes());
    for (const key of ALL_DRAFT_MARKER_KEYS) {
      assert.equal(out[key], undefined, `${key} must never persist`);
    }
    assert.equal(out.vinReviewState, undefined);
    assert.equal(out.make, "BMW");
    assert.equal(out.year, "2015");
  });

  it("AC7: forged draft markers without a valid receipt still omit the canonical VIN", () => {
    const out = finalizeCreateVinAuthority(
      dirtyAttributes() as Record<string, string | string[] | undefined>,
      "user-phase2d"
    );
    assert.equal(out.vin, undefined, "no receipt, no challenge store entry → VIN omitted");
    assert.equal(out.vinCandidate, undefined);
    assert.equal(out.yearConflict, undefined);
  });

  it("AC8: the LLM slice removes all draft markers, transport fields and review state, without mutating input", () => {
    const draft = baseDraft(dirtyAttributes());
    const snapshot = JSON.parse(JSON.stringify(draft));
    const slim = slimListingDraftForLlm(draft);
    assert.deepEqual(draft, snapshot, "input must not be mutated");
    const attrs = (slim as { attributes?: Record<string, string> }).attributes ?? {};
    for (const key of [...ALL_DRAFT_MARKER_KEYS, ...TRANSPORT_KEYS, "vinReviewState"]) {
      assert.equal(attrs[key], undefined, `${key} must never be model-visible`);
    }
    assert.equal(attrs.make, "BMW");
    assert.equal(attrs.year, "2015");
  });

  it("AC9: ingress stripping still removes every untrusted VIN marker AND the field-conflict markers from LLM/tool maps", () => {
    const malicious = {
      make: "BMW",
      vin: VALID_A,
      vinCandidate: VALID_A,
      vinChallenge: "vc_x",
      vinConfirmationReceipt: "forged",
      vinReviewId: "vr_x",
      yearConflict: "true",
      yearConflictCandidate: "2018",
    };
    const out = stripUntrustedVinMarkers(malicious);
    for (const key of UNTRUSTED_VIN_MARKER_KEYS) {
      assert.equal(out[key], undefined, `${key} must be stripped from untrusted ingress maps`);
    }
    assert.equal(out.yearConflict, undefined, "untrusted ingress must never mint a field conflict");
    assert.equal(out.yearConflictCandidate, undefined);
    assert.equal(out.make, "BMW");
  });

  it("AC8: the model-visible tool-result projection also hides the field-conflict markers", () => {
    const projected = redactVinReviewForModel({
      make: "BMW",
      year: "2015",
      yearConflict: "true",
      yearConflictCandidate: "2018",
      vin: VALID_A,
      vinCandidate: VALID_A,
      vinReviewId: "vr_x",
    });
    assert.equal(projected.make, "BMW");
    assert.equal(projected.year, "2015");
    assert.equal(projected.yearConflict, undefined);
    assert.equal(projected.yearConflictCandidate, undefined);
    assert.equal(projected.vin, undefined);
    assert.equal(projected.vinCandidate, undefined);
  });

  it("AC9: challenge state helper never mints authority from draft markers alone", () => {
    const ensured = ensureVinReviewChallenge(
      {
        vinCandidate: VALID_A,
        vinCandidateSource: "user_entered",
        vinReviewId: "vr_seam_1",
        vinUncertain: "true",
      },
      { userId: "user-phase2d" }
    );
    assert.ok(String(ensured.vinChallenge ?? "").length > 0, "a challenge may be registered");
    assert.equal(ensured.vin, undefined, "registration alone never writes canonical vin");
    assert.equal(ensured.vinConfirmationReceipt, undefined, "registration alone never mints a receipt");
  });
});
