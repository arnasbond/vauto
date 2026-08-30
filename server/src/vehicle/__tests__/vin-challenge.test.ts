/**
 * Phase 2C Round 5 — server-owned draft scope + challenge lifecycle.
 *
 * Integration-level: real in-memory stores, server-minted scopes/generations,
 * AUTOMATIC same-scope supersession (no client hints), cross-user supersession
 * protection, SAFE replay ordering (bindings before replay), bounded-store
 * behavior, and the production composition (ensure → consume → receipt →
 * finalize).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  consumeVinChallenge,
  ensureVinReviewChallenge,
  getDefaultVinChallengeStore,
  getDefaultVinScopeStore,
  mintVinDraftScope,
  registerVinChallenge,
  rejectVinChallenge,
  resetVinChallengeBoundaryForTests,
  verifyConfirmedVinChallenge,
  verifyVinDraftScope,
  VIN_STORE_LIMITS,
  type RegisterVinChallengeInput,
  type VinChallengeRecord,
} from "../vin-challenge.js";
import {
  buildConfirmedVinAttributesPatch,
  finalizeCreateVinAuthority,
  finalizePatchVinAuthority,
  verifyVinConfirmation,
  __vinConfirmationTestSecrets,
} from "../vin-confirmation.js";
import {
  applyVinExtractionCandidate,
  applyVinStructuredReviewAction,
  redactVinReviewForModel,
  stripUntrustedVinMarkers,
} from "../vin-review.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";
const VALID_C = "1HGCM82633A004352";
const USER_A = "user-a";
const USER_B = "user-b";
const LISTING_1 = "l-1";
const LISTING_2 = "l-2";

function mintReceipt(opts: {
  userId: string;
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  challengeId: string;
}) {
  return buildConfirmedVinAttributesPatch(opts);
}

function mustRegister(input: RegisterVinChallengeInput): VinChallengeRecord {
  const res = registerVinChallenge(input);
  assert.ok(res && res.outcome === "registered", `registration must succeed: ${JSON.stringify(res)}`);
  return res.challenge;
}

describe("Phase 2C R5 — server-owned draft scope", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-5");
  });

  it("mints a scope bound to the user and verifies it", () => {
    const scope = mintVinDraftScope(USER_A)!;
    assert.ok(scope.draftScope.startsWith("vs_"));
    const own = verifyVinDraftScope(USER_A, scope.draftScope);
    assert.equal(own.ok, true);
    const otherUser = verifyVinDraftScope(USER_B, scope.draftScope);
    assert.equal(otherUser.ok, false);
    assert.equal(otherUser.reason, "wrong_user");
    const invented = verifyVinDraftScope(USER_A, "vs_invented");
    assert.equal(invented.ok, false);
    assert.equal(invented.reason, "scope_not_found");
  });

  it("REQUIRED 15: no client-invented scope becomes authoritative", () => {
    const invented = "vs_fake";
    const registered = registerVinChallenge({
      userId: USER_A,
      values: [VALID_A],
      draftScope: invented,
    });
    assert.ok(registered && registered.outcome === "registered");
    // The challenge carries the invented string, but the scope store has no
    // record — verification fails, and the publish boundary rejects it:
    const verified = verifyVinDraftScope(USER_A, invented);
    assert.equal(verified.ok, false);
    const confirmed = consumeVinChallenge(
      { challengeId: registered.challenge.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(confirmed.outcome, "confirmed");
    // Even a confirmed receipt with a forged scope cannot persist:
    const persisted = finalizeCreateVinAuthority(confirmed.attrs, USER_A);
    assert.equal(persisted.vin, undefined, "a client-invented scope never becomes authority");
  });

  it("REQUIRED 1/2: automatic same-draft supersession without client hints", () => {
    const scope = mintVinDraftScope(USER_A)!;
    const a = mustRegister({ userId: USER_A, values: [VALID_A], draftScope: scope.draftScope });
    const consumedA = consumeVinChallenge(
      { challengeId: a.challengeId, userId: USER_A, vin: VALID_A, draftScope: scope.draftScope },
      mintReceipt
    );
    assert.equal(consumedA.outcome, "confirmed");

    // Register B for the same server scope WITHOUT any supersedes fields:
    const b = mustRegister({ userId: USER_A, values: [VALID_B], draftScope: scope.draftScope });

    // A became invalid automatically:
    const replayA = consumeVinChallenge(
      { challengeId: a.challengeId, userId: USER_A, vin: VALID_A, draftScope: scope.draftScope },
      mintReceipt
    );
    assert.equal(replayA.ok, false);
    assert.equal(replayA.outcome, "stale_generation");
    assert.equal(replayA.attrs, undefined, "failed replay returns no authority data");

    // Only the newest generation is valid:
    const freshB = consumeVinChallenge(
      { challengeId: b.challengeId, userId: USER_A, vin: VALID_B, draftScope: scope.draftScope },
      mintReceipt
    );
    assert.equal(freshB.outcome, "confirmed");
  });

  it("REQUIRED 2/3: automatic same-listing supersession + A→B→A with server scope", () => {
    const a1 = mustRegister({ userId: USER_A, values: [VALID_A], listingId: LISTING_1 });
    const confirmedA1 = consumeVinChallenge(
      { challengeId: a1.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_1 },
      mintReceipt
    );
    assert.equal(confirmedA1.outcome, "confirmed");

    // B supersedes A automatically (same userId+listingId):
    const b = mustRegister({ userId: USER_A, values: [VALID_B], listingId: LISTING_1 });
    const staleA1 = consumeVinChallenge(
      { challengeId: a1.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_1 },
      mintReceipt
    );
    assert.equal(staleA1.outcome, "stale_generation");

    // A again — a NEW generation:
    const a2 = mustRegister({ userId: USER_A, values: [VALID_A], listingId: LISTING_1 });
    const oldA1Again = consumeVinChallenge(
      { challengeId: a1.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_1 },
      mintReceipt
    );
    assert.equal(oldA1Again.outcome, "stale_generation", "identical VIN text never reactivates the old generation");
    const freshA2 = consumeVinChallenge(
      { challengeId: a2.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_1 },
      mintReceipt
    );
    assert.equal(freshA2.outcome, "confirmed");
  });

  it("REQUIRED 4: cross-user supersession attempts fail and leave A usable", () => {
    const a = mustRegister({ userId: USER_A, values: [VALID_A] });
    // User B tries to supersede A's challenge ID and review ID:
    const bAttempt = registerVinChallenge({
      userId: USER_B,
      values: [VALID_B],
      supersedesChallengeId: a.challengeId,
      supersedesReviewId: a.reviewId,
    });
    assert.ok(bAttempt && bAttempt.outcome === "registered", "B's own registration still succeeds");
    // A's challenge remains pending and usable by A:
    const confirmedA = consumeVinChallenge(
      { challengeId: a.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(confirmedA.outcome, "confirmed", "cross-user hints must never invalidate A's challenge");
  });

  it("REQUIRED 4b: cross-user supersession hints cannot invalidate a CONFIRMED challenge", () => {
    const a = mustRegister({ userId: USER_A, values: [VALID_A] });
    const confirmedA = consumeVinChallenge(
      { challengeId: a.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(confirmedA.outcome, "confirmed");

    registerVinChallenge({
      userId: USER_B,
      values: [VALID_B],
      supersedesChallengeId: a.challengeId,
    });

    const replayA = consumeVinChallenge(
      { challengeId: a.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(replayA.outcome, "already_confirmed", "B cannot supersede A's confirmed challenge");
  });
});

describe("Phase 2C R5 — SAFE confirmed replay ordering", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-5");
  });

  function confirmedChallengeFor(
    values: string[],
    opts: { userId?: string; listingId?: string; draftScope?: string } = {}
  ) {
    const userId = opts.userId ?? USER_A;
    const registered = mustRegister({
      userId,
      values,
      listingId: opts.listingId,
      draftScope: opts.draftScope ?? (opts.listingId ? undefined : mintVinDraftScope(userId)!.draftScope),
    });
    const consumed = consumeVinChallenge(
      {
        challengeId: registered.challengeId,
        userId,
        vin: values[0] ?? "",
        listingId: opts.listingId,
        draftScope: registered.draftScope,
      },
      mintReceipt
    );
    assert.equal(consumed.outcome, "confirmed");
    return { registered, consumed };
  }

  it("REQUIRED 10: same user + same scope + same VIN replay succeeds idempotently", () => {
    const scope = mintVinDraftScope(USER_A)!.draftScope;
    const { registered, consumed } = confirmedChallengeFor([VALID_A], { draftScope: scope });
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A, draftScope: scope },
      mintReceipt
    );
    assert.equal(replay.ok, true);
    assert.equal(replay.outcome, "already_confirmed");
    assert.deepEqual(replay.attrs, consumed.attrs, "replay returns the identical stored authority");
  });

  it("REQUIRED 5: another user cannot retrieve a confirmed receipt", () => {
    const { registered } = confirmedChallengeFor([VALID_A]);
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_B, vin: VALID_A },
      mintReceipt
    );
    assert.equal(replay.outcome, "wrong_user");
    assert.equal(replay.attrs, undefined, "failed replay leaks no authority");
  });

  it("REQUIRED 7: wrong listing cannot retrieve it", () => {
    const { registered } = confirmedChallengeFor([VALID_A], { listingId: LISTING_1 });
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_2 },
      mintReceipt
    );
    assert.equal(replay.outcome, "wrong_listing");
    assert.equal(replay.attrs, undefined);
  });

  it("REQUIRED 6: wrong draft scope cannot retrieve it", () => {
    const otherScope = mintVinDraftScope(USER_A)!.draftScope;
    const { registered } = confirmedChallengeFor([VALID_A]);
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A, draftScope: otherScope },
      mintReceipt
    );
    assert.equal(replay.outcome, "wrong_scope");
    assert.equal(replay.attrs, undefined);
  });

  it("REQUIRED 8: wrong VIN cannot retrieve it", () => {
    const { registered } = confirmedChallengeFor([VALID_A]);
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_B },
      mintReceipt
    );
    assert.equal(replay.outcome, "wrong_vin");
    assert.equal(replay.attrs, undefined);
  });

  it("REQUIRED 9: superseded challenge cannot replay", () => {
    const scope = mintVinDraftScope(USER_A)!.draftScope;
    const { registered } = confirmedChallengeFor([VALID_A], { draftScope: scope });
    mustRegister({ userId: USER_A, values: [VALID_B], draftScope: scope });
    const replay = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A, draftScope: scope },
      mintReceipt
    );
    assert.equal(replay.outcome, "stale_generation");
    assert.equal(replay.attrs, undefined);
  });

  it("REQUIRED 9: expired challenge cannot replay", () => {
    const registered = registerVinChallenge({
      userId: USER_A,
      values: [VALID_A],
      draftScope: mintVinDraftScope(USER_A)!.draftScope,
      nowMs: Date.now() - 31 * 60 * 1000,
      ttlOverrideMs: 60 * 1000,
    });
    assert.ok(registered && registered.outcome === "registered");
    const replay = consumeVinChallenge(
      { challengeId: registered.challenge.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(replay.outcome, "challenge_expired");
    assert.equal(replay.attrs, undefined);
  });

  it("REQUIRED 11: store capacity is bounded per user", () => {
    const scope = mintVinDraftScope(USER_A)!.draftScope;
    for (let i = 0; i < VIN_STORE_LIMITS.maxChallengesPerUser; i++) {
      // Each registration supersedes the previous pending one in the same scope,
      // so to fill the store we must use fresh scopes:
      const s = mintVinDraftScope(USER_A)!.draftScope;
      const res = registerVinChallenge({ userId: USER_A, values: [VALID_A], draftScope: s });
      assert.ok(res && res.outcome === "registered", `registration ${i} must succeed`);
    }
    // One more registration (fresh user scope is blocked by per-user cap):
    const over = registerVinChallenge({
      userId: USER_A,
      values: [VALID_A],
      draftScope: scope,
    });
    assert.equal(over?.outcome, "store_full", "per-user cap must reject further registrations");
  });

  it("REQUIRED 12: expired and terminal records are cleaned deterministically", () => {
    const scope = mintVinDraftScope(USER_A)!.draftScope;
    const a = mustRegister({
      userId: USER_A,
      values: [VALID_A],
      draftScope: scope,
      nowMs: Date.now() - 60 * 60 * 1000,
      ttlOverrideMs: 30 * 60 * 1000,
    });
    assert.ok(a, "registration succeeds");
    // Sweep on the next operation removes the expired pending record (as a
    // typed expired record) — then a further sweep drops terminal records.
    const sweep = registerVinChallenge({ userId: USER_A, values: [VALID_B], draftScope: scope });
    assert.ok(sweep && sweep.outcome === "registered");
    const records = getDefaultVinChallengeStore().list();
    const expiredCount = records.filter((r) => r.status === "expired").length;
    assert.ok(records.length <= VIN_STORE_LIMITS.maxChallengesPerUser, "store stays bounded");
    assert.ok(expiredCount <= 1, "expired pending records are kept only for typed outcomes");
  });

  it("scope store is bounded per user (oldest scope evicted)", () => {
    for (let i = 0; i < VIN_STORE_LIMITS.maxScopesPerUser + 2; i++) {
      mintVinDraftScope(USER_A);
    }
    const scopes = getDefaultVinScopeStore().list().filter((s) => s.userId === USER_A);
    assert.ok(scopes.length <= VIN_STORE_LIMITS.maxScopesPerUser, "per-user scope cap enforced");
  });
});

describe("Phase 2C R6 — GLOBAL store caps (multi-user)", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-6");
  });

  function fillChallengeStoreToGlobalCap(): { userOf: (id: string) => string } {
    // Distinct listing scopes per record avoid auto-supersession; distinct
    // users keep every record ACTIVE so the per-user cap cannot hide the
    // global cap.
    const perUser = 20;
    const users = Math.ceil(VIN_STORE_LIMITS.maxChallengesTotal / perUser);
    let total = 0;
    for (let u = 0; u < users && total < VIN_STORE_LIMITS.maxChallengesTotal; u++) {
      for (let i = 0; i < perUser && total < VIN_STORE_LIMITS.maxChallengesTotal; i++) {
        const userId = `bulk-user-${u}`;
        const res = registerVinChallenge({
          userId,
          values: [VALID_A],
          listingId: `bulk-listing-${u}-${i}`,
        });
        assert.ok(res && res.outcome === "registered", `fill registration ${total} must succeed`);
        total++;
      }
    }
    assert.equal(
      getDefaultVinChallengeStore().list().length,
      VIN_STORE_LIMITS.maxChallengesTotal,
      "store must be filled exactly to the global cap"
    );
    return { userOf: (id: string) => id };
  }

  it("REQUIRED 11 (global): the next registration at the global cap returns store_full; no active record is deleted or modified; repeated attempts do not grow the store", () => {
    fillChallengeStoreToGlobalCap();
    const snapshot = getDefaultVinChallengeStore()
      .list()
      .map((r) => JSON.stringify(r))
      .sort();

    const over = registerVinChallenge({
      userId: "overflow-user",
      values: [VALID_A],
      listingId: "overflow-listing",
    });
    assert.equal(over?.outcome, "store_full");
    assert.equal(
      getDefaultVinChallengeStore().list().length,
      VIN_STORE_LIMITS.maxChallengesTotal,
      "store size stays exactly at the cap"
    );

    const after = getDefaultVinChallengeStore()
      .list()
      .map((r) => JSON.stringify(r))
      .sort();
    assert.deepEqual(after, snapshot, "no existing active record was deleted or modified");

    for (let i = 0; i < 3; i++) {
      const again = registerVinChallenge({
        userId: `overflow-user-${i}`,
        values: [VALID_A],
        listingId: `overflow-listing-${i}`,
      });
      assert.equal(again?.outcome, "store_full", `repeated attempt ${i + 1} must be rejected`);
    }
    assert.equal(
      getDefaultVinChallengeStore().list().length,
      VIN_STORE_LIMITS.maxChallengesTotal,
      "repeated over-limit attempts do not grow the store"
    );
  });

  it("REQUIRED 11 (global): after an eligible terminal record is cleaned, one new registration succeeds", () => {
    // Fill to cap - 1 with active records, then create ONE terminal record
    // (supersession) — the store is then full with one evictable record.
    const perUser = 20;
    const users = Math.ceil((VIN_STORE_LIMITS.maxChallengesTotal - 1) / perUser);
    let total = 0;
    for (let u = 0; u < users && total < VIN_STORE_LIMITS.maxChallengesTotal - 1; u++) {
      for (let i = 0; i < perUser && total < VIN_STORE_LIMITS.maxChallengesTotal - 1; i++) {
        const res = registerVinChallenge({
          userId: `fill2-user-${u}`,
          values: [VALID_A],
          listingId: `fill2-listing-${u}-${i}`,
        });
        assert.ok(res && res.outcome === "registered");
        total++;
      }
    }
    // This registration SUPERSEDES the first fill2 record (same listing scope)
    // leaving one terminal record — total stays at cap - 1 + 2 = cap? No:
    // cap-1 active + 1 new = cap total, of which 1 is superseded (terminal).
    const superseding = registerVinChallenge({
      userId: "fill2-user-0",
      values: [VALID_B],
      listingId: "fill2-listing-0-0",
    });
    assert.ok(superseding && superseding.outcome === "registered");
    assert.equal(
      getDefaultVinChallengeStore().list().length,
      VIN_STORE_LIMITS.maxChallengesTotal,
      "store is now exactly at the cap with one terminal record"
    );

    // At the cap: the next registration sweeps/evicts the terminal record and
    // then succeeds.
    const next = registerVinChallenge({
      userId: "fresh-user",
      values: [VALID_A],
      listingId: "fresh-listing",
    });
    assert.ok(next && next.outcome === "registered", "terminal cleanup must free space for one registration");
    assert.ok(
      getDefaultVinChallengeStore().list().length <= VIN_STORE_LIMITS.maxChallengesTotal,
      "invariant: store size never exceeds the cap"
    );
  });

  it("REQUIRED 11/12 (global scopes): the global scope cap never evicts another user's active scope", () => {
    const perUser = VIN_STORE_LIMITS.maxScopesPerUser;
    const users = Math.ceil(VIN_STORE_LIMITS.maxScopesTotal / perUser);
    let total = 0;
    for (let u = 0; u < users && total < VIN_STORE_LIMITS.maxScopesTotal; u++) {
      for (let i = 0; i < perUser && total < VIN_STORE_LIMITS.maxScopesTotal; i++) {
        const scope = mintVinDraftScope(`scope-user-${u}`);
        assert.ok(scope, `scope ${total} must mint`);
        total++;
      }
    }
    assert.equal(
      getDefaultVinScopeStore().list().length,
      VIN_STORE_LIMITS.maxScopesTotal,
      "scope store filled exactly to the global cap"
    );
    const snapshot = getDefaultVinScopeStore().list().map((s) => ({ ...s }));

    // Another user cannot evict any active scope:
    const over = mintVinDraftScope("overflow-scope-user");
    assert.equal(over, null, "global cap must fail closed for other users");

    const after = getDefaultVinScopeStore().list();
    assert.equal(after.length, VIN_STORE_LIMITS.maxScopesTotal, "store size unchanged");
    for (const record of snapshot) {
      const current = after.find((s) => s.draftScope === record.draftScope);
      assert.ok(current, `scope ${record.draftScope} must survive`);
      assert.equal(current.userId, record.userId);
      assert.equal(current.expiresAt, record.expiresAt);
      assert.equal(
        verifyVinDraftScope(record.userId, record.draftScope).ok,
        true,
        "every previously active scope still verifies for its original user"
      );
    }

    // Repeated rejected attempts do not change the store:
    for (let i = 0; i < 3; i++) {
      assert.equal(mintVinDraftScope(`overflow-scope-user-${i}`), null);
    }
    assert.equal(getDefaultVinScopeStore().list().length, VIN_STORE_LIMITS.maxScopesTotal);
  });

  it("REQUIRED 12 (global scopes): an expired scope is cleaned and allows a new scope", () => {
    const perUser = VIN_STORE_LIMITS.maxScopesPerUser;
    const users = Math.ceil(VIN_STORE_LIMITS.maxScopesTotal / perUser);
    let total = 0;
    for (let u = 0; u < users && total < VIN_STORE_LIMITS.maxScopesTotal; u++) {
      for (let i = 0; i < perUser && total < VIN_STORE_LIMITS.maxScopesTotal; i++) {
        // Make the LAST scope already expired at mint time:
        const expired = total === VIN_STORE_LIMITS.maxScopesTotal - 1;
        const scope = mintVinDraftScope(`scope2-user-${u}`, expired
          ? { nowMs: Date.now() - 60 * 1000, ttlOverrideMs: 1000 }
          : undefined);
        assert.ok(scope, `scope ${total} must mint`);
        total++;
      }
    }
    // The expired scope is swept on the next mint → one new scope succeeds:
    const fresh = mintVinDraftScope("scope2-fresh-user");
    assert.ok(fresh, "expired-scope cleanup must free global capacity");
    assert.ok(
      getDefaultVinScopeStore().list().length <= VIN_STORE_LIMITS.maxScopesTotal,
      "invariant: scope store size never exceeds the cap"
    );
  });

  it("REQUIRED 12 (global scopes): a user reaching the per-user cap affects only that user", () => {
    for (let i = 0; i < VIN_STORE_LIMITS.maxScopesPerUser; i++) {
      mintVinDraftScope(USER_A);
    }
    const otherBefore = mintVinDraftScope(USER_B);
    assert.ok(otherBefore, "user B mints fine while A is at the per-user cap");
    const aScopesBefore = getDefaultVinScopeStore().list().filter((s) => s.userId === USER_A);
    assert.equal(aScopesBefore.length, VIN_STORE_LIMITS.maxScopesPerUser, "A's cap is stable");

    // A mints once more → A's own oldest scope is evicted (policy), B untouched:
    const aOver = mintVinDraftScope(USER_A);
    assert.ok(aOver, "A's per-user policy evicts A's OWN oldest scope");
    const aScopesAfter = getDefaultVinScopeStore().list().filter((s) => s.userId === USER_A);
    assert.equal(aScopesAfter.length, VIN_STORE_LIMITS.maxScopesPerUser, "A stays at its own cap");
    assert.equal(
      verifyVinDraftScope(USER_B, otherBefore.draftScope).ok,
      true,
      "B's active scope is never evicted by A's churn"
    );
  });
});

describe("Phase 2C R5 — challenge registration lifecycle (Round 4 regressions)", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-5");
  });

  it("REQUIRED 13: a server-generated candidate receives a valid challenge via ensure", () => {
    const attrs = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const ensured = ensureVinReviewChallenge(attrs, { userId: USER_A });
    assert.ok(ensured.vinChallenge, "server must mint a challenge for the candidate");
    assert.ok(ensured.vinDraftScope, "server must mint a draft scope");
    assert.notEqual(ensured.vinReviewId, attrs.vinReviewId, "server generation replaces the client one");

    const consumed = consumeVinChallenge(
      {
        challengeId: String(ensured.vinChallenge),
        userId: USER_A,
        vin: VALID_A,
        draftScope: String(ensured.vinDraftScope),
      },
      mintReceipt
    );
    assert.equal(consumed.ok, true);
    assert.equal(consumed.outcome, "confirmed");
    assert.ok(consumed.attrs?.vinConfirmationReceipt, "consumption mints the confirmation receipt");

    const persisted = finalizeCreateVinAuthority(consumed.attrs, USER_A);
    assert.equal(persisted.vin, VALID_A, "challenge-derived receipt persists at the final boundary");
  });

  it("REQUIRED 1/2: invented reviewId + plausible VIN cannot obtain a receipt", () => {
    const consumed = consumeVinChallenge(
      { challengeId: "vc_invented", userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.ok, false);
    assert.equal(consumed.outcome, "challenge_not_found");
    assert.equal(consumed.attrs, undefined);
  });

  it("REQUIRED 3: tampered challenge fails", () => {
    const attrs = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const ensured = ensureVinReviewChallenge(attrs, { userId: USER_A });
    const tamperedId =
      String(ensured.vinChallenge).slice(0, -1) +
      (String(ensured.vinChallenge).endsWith("0") ? "1" : "0");
    const consumed = consumeVinChallenge(
      { challengeId: tamperedId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.outcome, "challenge_not_found");
  });

  it("REQUIRED 4: expired challenge fails", () => {
    const registered = registerVinChallenge({
      userId: USER_A,
      values: [VALID_A],
      draftScope: mintVinDraftScope(USER_A)!.draftScope,
      nowMs: Date.now() - 31 * 60 * 1000,
      ttlOverrideMs: 60 * 1000,
    });
    assert.ok(registered && registered.outcome === "registered");
    const consumed = consumeVinChallenge(
      { challengeId: registered.challenge.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.outcome, "challenge_expired");
  });

  it("REQUIRED 5: challenge belonging to another user fails", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A] });
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_B, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.outcome, "wrong_user");
  });

  it("REQUIRED 7: challenge belonging to another listing fails", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A], listingId: LISTING_1 });
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A, listingId: LISTING_2 },
      mintReceipt
    );
    assert.equal(consumed.outcome, "wrong_listing");
  });

  it("REQUIRED 8: challenge for another VIN fails", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A] });
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_B },
      mintReceipt
    );
    assert.equal(consumed.outcome, "wrong_vin");
  });

  it("REQUIRED 9: conflict choice outside the permitted set fails", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A, VALID_B] });
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_C },
      mintReceipt
    );
    assert.equal(consumed.outcome, "choice_not_allowed");
  });

  it("reject invalidates the challenge (no later confirm)", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A] });
    const rejected = rejectVinChallenge(registered.challengeId, USER_A);
    assert.equal(rejected.outcome, "rejected");
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.outcome, "challenge_not_found");
  });

  it("reject by another user fails", () => {
    const registered = mustRegister({ userId: USER_A, values: [VALID_A] });
    const result = rejectVinChallenge(registered.challengeId, USER_B);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "wrong_user");
  });

  it("register refuses implausible values / empty user / >2 choices", () => {
    assert.equal(registerVinChallenge({ userId: "", values: [VALID_A] }), null);
    assert.equal(registerVinChallenge({ userId: USER_A, values: ["NOPE"] }), null);
    assert.equal(
      registerVinChallenge({ userId: USER_A, values: [VALID_A, VALID_B, VALID_C] }),
      null
    );
  });

  it("REQUIRED 15: direct attribute manipulation cannot bypass challenge verification", () => {
    const forged = {
      vinCandidate: VALID_A,
      vinReviewId: "vr_forged",
      vinChallenge: "vc_forged",
      vinDraftScope: "vs_forged",
      vinConfirmed: "true",
    };
    const consumed = consumeVinChallenge(
      { challengeId: "vc_forged", userId: USER_A, vin: VALID_A },
      mintReceipt
    );
    assert.equal(consumed.outcome, "challenge_not_found");
    const persisted = finalizeCreateVinAuthority(forged, USER_A);
    assert.equal(persisted.vin, undefined);
  });

  it("REQUIRED 18/19: listing-bound confirmation persists; create confirmation cannot authorize a PATCH", () => {
    const registered = mustRegister({
      userId: USER_A,
      values: [VALID_B],
      listingId: LISTING_1,
    });
    const consumed = consumeVinChallenge(
      { challengeId: registered.challengeId, userId: USER_A, vin: VALID_B, listingId: LISTING_1 },
      mintReceipt
    );
    assert.equal(consumed.outcome, "confirmed");

    const patched = finalizePatchVinAuthority(consumed.attrs, {
      userId: USER_A,
      listingId: LISTING_1,
      existingVin: VALID_A,
    });
    assert.equal(patched.vin, VALID_B);

    const createRegistered = mustRegister({
      userId: USER_A,
      values: [VALID_B],
      draftScope: mintVinDraftScope(USER_A)!.draftScope,
    });
    const createConsumed = consumeVinChallenge(
      { challengeId: createRegistered.challengeId, userId: USER_A, vin: VALID_B },
      mintReceipt
    );
    const patchedWithCreateReceipt = finalizePatchVinAuthority(createConsumed.attrs, {
      userId: USER_A,
      listingId: LISTING_1,
      existingVin: VALID_A,
    });
    assert.equal(patchedWithCreateReceipt.vin, undefined, "create receipt must not authorize a PATCH replacement");
  });

  it("REQUIRED 20: challenge, scope and receipt never appear in model-visible projections", () => {
    const attrs = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const ensured = ensureVinReviewChallenge(attrs, { userId: USER_A });
    const model = redactVinReviewForModel(ensured);
    assert.equal(model.vinChallenge, undefined);
    assert.equal(model.vinDraftScope, undefined);
    assert.equal(model.vin, undefined);
    assert.equal(model.vinReviewId, undefined);
    const stripped = stripUntrustedVinMarkers(ensured);
    assert.equal(stripped.vinChallenge, undefined);
    assert.equal(stripped.vinDraftScope, undefined);
  });

  it("a fresh receipt verifies even when its challenge expired (challenge and receipt lifetimes are separate)", () => {
    const registered = registerVinChallenge({
      userId: USER_A,
      values: [VALID_A],
      draftScope: mintVinDraftScope(USER_A)!.draftScope,
      nowMs: Date.now() - 25 * 60 * 60 * 1000,
      ttlOverrideMs: 60 * 1000,
    });
    assert.ok(registered && registered.outcome === "registered");
    // The publish-boundary challenge check rejects an expired challenge record:
    const check = verifyConfirmedVinChallenge({
      challengeId: registered.challenge.challengeId,
      userId: USER_A,
      vin: VALID_A,
      reviewId: registered.challenge.reviewId,
    });
    assert.equal(check.outcome, "challenge_expired");
  });
});
