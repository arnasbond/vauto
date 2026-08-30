/**
 * Phase 2C — client-side contract tests (REQUIRED 23, 30).
 *
 * Runs the SAME authoritative module the browser bundle loads
 * (`@vauto/shared/vin-review`) plus the client adapters:
 *  - `applyVinCandidateToAttrs` (thin adapter in src/lib/vehicle-attribute-extract.ts)
 *  - `routeVinReviewChip` (quick-reply label → trusted structured action routing)
 *
 * No jsdom/React: the VinReviewCard component is a thin render over the payload
 * and the `onAction` callback — the logic it depends on is proven here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyVinExtractionCandidate,
  applyVinStructuredReviewAction,
  buildVinReviewSideEffect,
  confirmVin,
  deriveVinReviewState,
  type VinReviewStructuredAction,
} from "@vauto/shared/vin-review";
import { applyVinCandidateToAttrs } from "@/lib/vehicle-attribute-extract";
import { routeVinReviewChip } from "@/lib/vin-review-chips";
import {
  apiConfirmVinReview,
  apiRegisterVinReview,
} from "@/lib/api/client";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

describe("Phase 2C client — shared module is loaded through the client alias", () => {
  it("chat/VISION VIN becomes a candidate only through the client adapter", () => {
    const attrs = applyVinCandidateToAttrs({ make: "BMW" }, VALID_A, "photo_ocr");
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinCandidateSource, "photo_ocr");
    assert.ok(attrs.vinReviewId, "client-side candidates must mint a review generation");
  });

  it("the client adapter never writes canonical vin directly", () => {
    const attrs = applyVinCandidateToAttrs(
      { vin: VALID_A, vinConfirmed: "true", vinConfirmedSource: "user_entered", vinConfirmedReviewId: "vr_1" },
      VALID_B,
      "unknown"
    );
    assert.equal(attrs.vin, VALID_A, "a confirmed canonical survives a disagreeing client extraction");
    assert.equal(deriveVinReviewState(attrs).status, "conflict");
  });

  it("trusted side-effect payload → structured confirm → refreshed payload (UI round trip)", () => {
    const attrs = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const payload = buildVinReviewSideEffect(attrs);
    assert.ok(payload, "side-effect must carry the review payload for the UI");
    assert.equal(payload!.reviewId, attrs.vinReviewId);

    // The UI emits the structured action bound to the payload's reviewId.
    const action: VinReviewStructuredAction = {
      type: "confirm",
      value: payload!.candidate ?? "",
      reviewId: payload!.reviewId,
    };
    const result = applyVinStructuredReviewAction(attrs, action);
    assert.equal(result.outcome, "applied");
    assert.equal(result.attrs.vin, VALID_A);

    // The refreshed side-effect disappears (review resolved) — UI hides the card.
    assert.equal(buildVinReviewSideEffect(result.attrs), null);
  });

  it("quick-reply chip labels route to the trusted payload, never to chat text", () => {
    const attrs = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const payload = buildVinReviewSideEffect(attrs)!;
    const emitted: VinReviewStructuredAction[] = [];
    const consumed = routeVinReviewChip("Patvirtinti VIN", payload, (a) => emitted.push(a));
    assert.equal(consumed, true);
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0], {
      type: "confirm",
      value: VALID_A,
      reviewId: payload.reviewId,
    });
  });

  it("reject chip routes to a generation-bound reject action", () => {
    const attrs = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const payload = buildVinReviewSideEffect(attrs)!;
    const emitted: VinReviewStructuredAction[] = [];
    const consumed = routeVinReviewChip("Nežinau VIN", payload, (a) => emitted.push(a));
    assert.equal(consumed, true);
    assert.deepEqual(emitted[0], { type: "reject", reviewId: payload.reviewId });
  });

  it("unrelated chips are never consumed by the VIN router", () => {
    const attrs = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const payload = buildVinReviewSideEffect(attrs)!;
    let emitted = false;
    assert.equal(
      routeVinReviewChip("Taip, publikuoti", payload, () => {
        emitted = true;
      }),
      false
    );
    assert.equal(emitted, false);
  });

  it("with no pending review the chip router lets text flow normally", () => {
    let emitted = false;
    assert.equal(
      routeVinReviewChip("Patvirtinti VIN", null, () => {
        emitted = true;
      }),
      false
    );
    assert.equal(emitted, false);
  });

  it("cross-session: a confirm bound to another draft's reviewId cannot confirm this draft", () => {
    const mine = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const foreign = applyVinExtractionCandidate({}, { value: VALID_B, source: "unknown" });
    const stale = confirmVin(mine, {
      type: "confirm",
      value: VALID_A,
      reviewId: foreign.vinReviewId ?? "",
    });
    assert.equal(stale.outcome, "stale_review");
    assert.equal(stale.attrs.vin, undefined);
  });

  it("REQUIRED 20 (client): PrePublish confirm routes register → confirm through the authenticated server endpoints with a server draft scope", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.test.local";
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        sent.push({ url, body });
        if (url.endsWith("/api/vin-review/register")) {
          return new Response(
            JSON.stringify({
              ok: true,
              outcome: "registered",
              draftScope: "vs_server_1",
              challenge: { challengeId: "vc_server_1", expiresAt: Date.now() + 60000 },
              attributes: {
                vinCandidate: VALID_A,
                vinCandidateSource: "user_entered",
                vinUncertain: "true",
                vinReviewId: "vr_server_1",
                vinChallenge: "vc_server_1",
                vinDraftScope: "vs_server_1",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            outcome: "confirmed",
            attributes: {
              vin: VALID_A,
              vinConfirmed: "true",
              vinConfirmedSource: "user_entered",
              vinConfirmedReviewId: "vr_server_1",
              vinChallenge: "vc_server_1",
              vinDraftScope: "vs_server_1",
              vinConfirmationReceipt: "receipt-from-server",
              vinConfirmationIssuedAt: "1",
              vinConfirmationExpiresAt: "9999999999",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch;

      const registered = await apiRegisterVinReview({
        values: [VALID_A],
        draftScope: "vs_prior",
        supersedesChallengeId: "vc_old",
        supersedesReviewId: "vr_old",
      });
      assert.equal(registered.ok, true);
      if (!registered.ok) return;
      assert.equal(registered.data.challenge.challengeId, "vc_server_1");
      assert.equal(registered.data.draftScope, "vs_server_1");

      const confirmed = await apiConfirmVinReview({
        challengeId: registered.data.challenge.challengeId,
        value: VALID_A,
        draftScope: "vs_server_1",
      });
      assert.equal(confirmed.ok, true);
      if (!confirmed.ok) return;
      assert.equal(confirmed.data.outcome, "confirmed");
      assert.equal(confirmed.data.attributes.vinConfirmationReceipt, "receipt-from-server");
      assert.equal(confirmed.data.attributes.vinChallenge, "vc_server_1");
      assert.equal(confirmed.data.attributes.vinDraftScope, "vs_server_1");

      assert.equal(sent.length, 2);
      assert.match(sent[0]!.url, /\/api\/vin-review\/register$/);
      assert.deepEqual(sent[0]!.body, {
        values: [VALID_A],
        draftScope: "vs_prior",
        supersedesChallengeId: "vc_old",
        supersedesReviewId: "vr_old",
      });
      assert.match(sent[1]!.url, /\/api\/vin-review\/confirm$/);
      assert.deepEqual(sent[1]!.body, {
        challengeId: "vc_server_1",
        value: VALID_A,
        draftScope: "vs_server_1",
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = originalEnv;
    }
  });

  it("REQUIRED 14 (client): listing-bound replacement registers with the real listingId", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.test.local";
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        sent.push({ url, body });
        if (url.endsWith("/api/vin-review/register")) {
          return new Response(
            JSON.stringify({
              ok: true,
              outcome: "registered",
              draftScope: "",
              challenge: { challengeId: "vc_listing_1", expiresAt: Date.now() + 60000 },
              attributes: {
                vinCandidate: VALID_A,
                vinCandidateSource: "user_entered",
                vinUncertain: "true",
                vinReviewId: "vr_listing_1",
                vinChallenge: "vc_listing_1",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            outcome: "confirmed",
            attributes: { vin: VALID_A, vinConfirmed: "true", vinConfirmedReviewId: "vr_listing_1", vinChallenge: "vc_listing_1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch;

      const registered = await apiRegisterVinReview({
        values: [VALID_A],
        listingId: "l-real-1",
      });
      assert.equal(registered.ok, true);
      if (!registered.ok) return;
      const confirmed = await apiConfirmVinReview({
        challengeId: registered.data.challenge.challengeId,
        value: VALID_A,
        listingId: "l-real-1",
      });
      assert.equal(confirmed.ok, true);
      assert.deepEqual(sent[0]!.body, { values: [VALID_A], listingId: "l-real-1" });
      assert.deepEqual(sent[1]!.body, {
        challengeId: "vc_listing_1",
        value: VALID_A,
        listingId: "l-real-1",
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = originalEnv;
    }
  });

  it("REQUIRED 21 (client): a local reducer result alone carries no server authority", () => {
    const attrs = applyVinCandidateToAttrs({}, VALID_A, "photo_ocr");
    const localOnly = applyVinStructuredReviewAction(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    }).attrs;
    assert.equal(localOnly.vinConfirmed, "true", "local state may show confirmed draft state");
    assert.equal(
      (localOnly as Record<string, string>).vinConfirmationReceipt,
      undefined,
      "a purely local reducer result never carries a confirmation receipt"
    );
    assert.equal(
      (localOnly as Record<string, string>).vinChallenge,
      undefined,
      "a purely local reducer result never carries a server challenge"
    );
  });
});
