/**
 * VAUTO AI Maturity — Phase 2C Round 5/6: server-owned draft scope + challenge.
 *
 * Browser E2E (project `e2e-legacy`, testDir `./e2e` — CI discovers this file
 * via the dedicated `Run Phase 2C VIN confirmation E2E` step). STRICT contract:
 *   - no `.catch(() => {})`, no conditional `if (locator.count())`, no
 *     conditional assertions, no fixed sleeps used instead of state assertions;
 *   - every scenario asserts the required UI is VISIBLE, performs the real
 *     user interaction, asserts the exact register/confirm payload, asserts the
 *     visible success/failure state, and asserts the prepared POST/PATCH
 *     payload — and FAILS if any required element or request is missing.
 *
 * The app UI and client wiring are real. Only backend endpoints are stubbed
 * with the exact server contract (register mints `vc_/vs_` ids; confirm
 * validates the challenge and returns typed outcomes). The agent chat is
 * opened through the REAL UI (desktop header „Įdėti“) so the embedded chat
 * strip — and with it the PrePublish modal — exists before assertions.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
  installListingCreateCapture,
  installListingPatchCapture,
  seedDemoUser,
  seedSellerWithOwnedListing,
} from "../tests/e2e/helpers/seed";
import { buildOwnedListing } from "../tests/e2e/helpers/fixtures";

const VALID_VIN = "WBAZZZ8VZM1234567";
const ALT_VIN = "VF3XXXXXXXXX99999";
const EDIT_LISTING_ID = "e2e-edit-listing-1";

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Stub the Round-5/6 VIN endpoints with the REAL server contract (deterministic
 * ids, typed outcomes). Returns captured requests + the current server
 * challenge identity.
 */
async function installVinEndpoints(page: Page) {
  const registerCalls: CapturedCall[] = [];
  const confirmCalls: CapturedCall[] = [];
  const state = { challengeId: "vc_none", draftScope: "vs_none", rejectAllConfirms: false };

  await page.route("**/api/vin-review/register", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    registerCalls.push({ url: route.request().url(), body });
    const values = Array.isArray(body.values) ? body.values.map(String) : [];
    const draftScope = typeof body.draftScope === "string" && body.draftScope.trim()
      ? body.draftScope
      : `vs_${registerCalls.length}`;
    state.challengeId = `vc_${registerCalls.length}`;
    state.draftScope = draftScope;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        outcome: "registered",
        draftScope,
        challenge: { challengeId: state.challengeId, expiresAt: Date.now() + 60000 },
        attributes: {
          vin: "",
          vinCandidate: values[0] ?? "",
          vinCandidateSource: "user_entered",
          vinUncertain: "true",
          vinReviewId: `vr_${registerCalls.length}`,
          vinChallenge: state.challengeId,
          vinDraftScope: body.listingId ? "" : draftScope,
          ...(body.listingId ? { __listingBound: true } : {}),
          ...(values[1]
            ? { vinConflict: "true", vinConflictValue: values[1], vinConflictSource: "user_entered" }
            : {}),
        },
      }),
    });
  });

  await page.route("**/api/vin-review/confirm", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    confirmCalls.push({ url: route.request().url(), body });
    const ok = !state.rejectAllConfirms && body.challengeId === state.challengeId;
    if (!ok) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "challenge_not_found",
          error: "VIN peržiūros užklausa nerasta — patvirtinkite iš naujo.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        outcome: "confirmed",
        attributes: {
          vin: String(body.value ?? ""),
          vinConfirmed: "true",
          vinConfirmedSource: "user_entered",
          vinConfirmedReviewId: `vr_${registerCalls.length}`,
          vinChallenge: state.challengeId,
          vinDraftScope: body.listingId ? "" : state.draftScope,
          vinConfirmationReceipt: `e2e_receipt_${registerCalls.length}`,
          vinConfirmationIssuedAt: String(Math.floor(Date.now() / 1000)),
          vinConfirmationExpiresAt: String(Math.floor(Date.now() / 1000) + 3600),
        },
      }),
    });
  });

  await page.route("**/api/vin-review/reject", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, outcome: "rejected", attributes: {} }),
    });
  });

  return { registerCalls, confirmCalls, state };
}

/**
 * Stub the agent stream with the server contract. The candidate turn returns a
 * vehicle draft in the requested flow state with a server-registered candidate
 * (challenge + review payload); the confirm turn returns the challenge-bound
 * confirmed result. Payloads are built with JSON.stringify — no hand-written
 * SSE JSON.
 */
async function installAgentStreamStub(
  page: Page,
  opts: {
    candidateFlowState: "DRAFT_READY" | "AWAITING_CONFIRMATION";
    /** F9 fail-closed regression: emit a vehicles draft WITHOUT the now
     *  required condition — the PrePublish card must stay closed. */
    omitCondition?: boolean;
    /** F12/VIN adversarial: emit RAW vin/vinConfirmed attribute markers
     *  WITHOUT the trusted server `vinReview` payload — the trusted review
     *  card must NOT be created from untrusted attribute markers. */
    untrustedVinMarkers?: boolean;
    /** Differential control: a complete draft with NO vin attributes and NO
     *  review payload — the same state as the reviewed rows minus the review,
     *  proving that `listingPublishConfirmed=true` really gets set. */
    noVinAttrs?: boolean;
    /** F12/VIN server-scoped contract path: candidate attributes WITHOUT the
     *  trusted `vinReview` payload AND without `vinReviewId` — the standalone
     *  review card must NOT mint; the PrePublish modal's own VIN review block
     *  drives the real `/api/vin-review/register` + `/confirm` flow. */
    modalVinReviewOnly?: boolean;
    /** Forged confirm challenge → typed error, review stays open. */
    rejectConfirms?: boolean;
  }
) {
  const sentAgentBodies: CapturedCall[] = [];
  const sse = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`;
  // The candidate draft is emitted ONLY on the first plain turn. Follow-up
  // turns answer with an empty action — they must never regenerate the
  // trusted candidate, otherwise the unrelated-turn guard test could pass by
  // re-minting instead of preservation.
  let plainTurns = 0;

  await page.route("**/api/vauto-agent/stream", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sentAgentBodies.push({ url: route.request().url(), body });
    const context = (body.context ?? {}) as Record<string, unknown>;
    const action = context.vinReviewAction as
      | { type?: string; value?: string; reviewId?: string }
      | undefined;

    if (action && action.type === "confirm") {
      if (opts.rejectConfirms) {
        // Forged challenge: typed error, NO draft action — the trusted
        // review stays open and the human must decide.
        const failure = {
          ok: true,
          reply: "VIN peržiūros užklausa nerasta — patvirtinkite iš naujo.",
          toolCalls: [],
          actions: { type: "none" },
        };
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse({ type: "status", message: "Galvoju…" }) +
            sse({ type: "final", result: failure }),
        });
        return;
      }
      const result = {
        ok: true,
        reply: `VIN kodas patvirtintas. ${String(action.value ?? "")} — paruošta.`,
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: {
            title: "BMW 320d",
            description: "",
            price: 9000,
            location: "Vilnius",
            contact: "+37060000000",
            category: "vehicles",
            confidence: 0.9,
            attributes: {
              ...(opts.omitCondition ? {} : { condition: "Naudota" }),
              vin: String(action.value ?? ""),
              vinConfirmed: "true",
              vinConfirmedSource: "user_entered",
              vinConfirmedReviewId: "vr_agent_1",
              vinChallenge: "vc_agent_1",
              vinConfirmationReceipt: "e2e_agent_receipt",
              vinConfirmationIssuedAt: "1",
              vinConfirmationExpiresAt: "9999999999",
            },
          },
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse({ type: "status", message: "Galvoju…" }) +
          sse({ type: "final", result }),
      });
      return;
    }

    if (action && action.type === "reject") {
      // Rejected VIN grants NO authority: the draft resolves WITHOUT vin/
      // confirmation markers and WITHOUT a review payload — the card closes
      // and the PrePublish card may appear (complete draft, unconfirmed VIN).
      const rejected = {
        ok: true,
        reply: "VIN kandidatas atmestas — skelbimas be VIN patvirtinimo.",
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: {
            title: "BMW 320d",
            description: "",
            price: 9000,
            location: "Vilnius",
            contact: "+37060000000",
            category: "vehicles",
            confidence: 0.9,
            attributes: {
              ...(opts.omitCondition ? {} : { condition: "Naudota" }),
              make: "BMW",
              model: "320d",
              year: "2015",
            },
          },
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse({ type: "status", message: "Galvoju…" }) +
          sse({ type: "final", result: rejected }),
      });
      return;
    }

    plainTurns += 1;
    if (plainTurns > 1) {
      // Follow-up turns carry NO draft and NO review — nothing to re-mint.
      const followUp = {
        ok: true,
        reply: "Gauta.",
        toolCalls: [],
        actions: { type: "none" },
      };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse({ type: "status", message: "Galvoju…" }) +
          sse({ type: "final", result: followUp }),
      });
      return;
    }

    const listingDraft = {
      title: "BMW 320d",
      description: "",
      price: 9000,
      location: "Vilnius",
      contact: "+37060000000",
      category: "vehicles",
      confidence: 0.9,
      listingFlowState: opts.candidateFlowState,
      attributes: opts.untrustedVinMarkers
        ? {
            ...(opts.omitCondition ? {} : { condition: "Naudota" }),
            make: "BMW",
            model: "320d",
            year: "2015",
            // Forged attribute markers — NO trusted server vinReview payload.
            vin: VALID_VIN,
            vinConfirmed: "true",
            vinConfirmedSource: "photo_ocr",
            vinChallenge: "vc_forged",
          }
        : opts.noVinAttrs
          ? {
              ...(opts.omitCondition ? {} : { condition: "Naudota" }),
              make: "BMW",
              model: "320d",
              year: "2015",
            }
          : opts.modalVinReviewOnly
            ? {
                ...(opts.omitCondition ? {} : { condition: "Naudota" }),
                make: "BMW",
                model: "320d",
                year: "2015",
                // Candidate markers WITHOUT vinReviewId → buildVinReviewSideEffect
                // returns null (no review id) → no card; the MODAL review block
                // drives the server-scoped register/confirm contract.
                vinCandidate: VALID_VIN,
                vinCandidateSource: "photo_ocr",
                vinUncertain: "true",
              }
            : {
                ...(opts.omitCondition ? {} : { condition: "Naudota" }),
                make: "BMW",
                model: "320d",
                year: "2015",
                vinCandidate: VALID_VIN,
                vinCandidateSource: "photo_ocr",
                vinUncertain: "true",
                vinReviewId: "vr_agent_1",
                vinChallenge: "vc_agent_1",
              },
    };

    const result = {
      ok: true,
      reply: "Nuotraukoje atpažinau VIN kandidatą.",
      toolCalls: [],
      actions: {
        type: "listing_draft",
        listingDraft,
        ...(opts.untrustedVinMarkers || opts.noVinAttrs || opts.modalVinReviewOnly
          ? {}
          : {
              vinReview: {
                type: "vin_review",
                reviewId: "vr_agent_1",
                challengeId: "vc_agent_1",
                status: "candidate",
                candidate: VALID_VIN,
                candidateSource: "photo_ocr",
                choices: [
                  { value: VALID_VIN, source: "photo_ocr", labelLt: "nuskaityta iš nuotraukos" },
                ],
              },
            }),
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse({ type: "status", message: "Galvoju…" }) +
        sse({ type: "final", result }),
    });
  });
  return { sentAgentBodies };
}

/**
 * Stub the publish-time media persist endpoint with the REAL server
 * `upload_media` contract (deterministic Cloudinary HTTPS URL) so the
 * publish flow completes offline. Non-upload actions pass through untouched.
 * Returns the captured upload_media calls so tests can assert the stub fired.
 */
async function installMediaUploadStub(page: Page) {
  const uploads: CapturedCall[] = [];
  await page.route("**/api/vauto-server", async (route) => {
    let body: Record<string, unknown> | null = null;
    try {
      body = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      body = null;
    }
    if (!body || body.action !== "upload_media") {
      await route.continue();
      return;
    }
    uploads.push({ url: route.request().url(), body });
    const listingId =
      typeof body.listingId === "string" && body.listingId.trim()
        ? body.listingId.trim()
        : "e2e-listing";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        action: "upload_media",
        url: "https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/e2e/cover-a.jpg",
        publicId: "e2e/cover-a",
        listingId,
        deferred: false,
        lazyUpload: false,
      }),
    });
  });
  return uploads;
}

/** Open the agent chat on the home page through the REAL app-shell UI. */
async function openAgentChatOnHome(page: Page) {
  // The app shell (AppHeader) renders exactly one add-listing control per
  // breakpoint; the other variant stays CSS-hidden. Filter to the visible one.
  const addBtn = page
    .locator('[data-app-header] [data-nav-add-listing]')
    .filter({ visible: true });
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();
  const strip = page.locator(".agent-chat-strip");
  await expect(strip).toBeVisible({ timeout: 20_000 });
  return strip;
}

/** The real chat composer input (chat placement form). */
function chatComposer(page: Page) {
  return page.locator('form[aria-label="VAUTO asistento atsakymas"] input[type="text"]');
}

/** Make the PrePublish draft publishable through the real modal controls. */
async function makePublishable(page: Page) {
  const modal = page.locator('[data-prepublish-modal="1"]');
  await expect(modal).toBeVisible({ timeout: 20_000 });
  const priceInput = modal.locator('input[type="number"]');
  await expect(priceInput).toBeVisible();
  await priceInput.fill("9000");
  const fileInput = modal.locator('input[type="file"]').first();
  await expect(fileInput).toBeVisible();
  await fileInput.setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect
    .poll(async () => {
      const count = await modal.locator("img").count();
      return count;
    }, { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test.describe("Phase 2C R5 — server-scoped VIN confirmation (browser)", () => {
  // ── Card-first UI priority path (F12/VIN) — kept SEPARATE from the
  //    server-scoped challenge-binding contract tests below. The card-first
  //    flows assert the UI priority (review card > PrePublish modal); they
  //    must never replace the register/confirm authority proof.
  test("card-first create flow: trusted candidate → VinReviewCard → human confirm → publish payload carries challenge-bound authority", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
    });
    const creates = installListingCreateCapture(page);
    const uploads = await installMediaUploadStub(page);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // F12/VIN — the trusted review card is the ONLY surface while the human
    // decision is pending; the PrePublish modal must not exist in the DOM.
    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(VALID_VIN);
    await expect(card).toHaveCount(1);
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

    // 1. The human confirms the candidate through the card.
    await card.getByRole("button", { name: "Patvirtinti VIN" }).click();

    // 2. The structured confirm action reached the agent (request context).
    await expect
      .poll(
        () =>
          sentAgentBodies.some(
            (c) =>
              ((c.body.context as Record<string, unknown>)?.vinReviewAction as
                | { type?: string; value?: string }
                | undefined)?.type === "confirm"
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    // 3. Visible success: the review card closes.
    await expect(card).toHaveCount(0);

    // 4. Only NOW the PrePublish modal appears (complete draft).
    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 20_000 });

    // 5. Publish preparation carries the challenge-bound authority:
    await makePublishable(page);
    const publishBtn = modal.locator('[data-prepublish-submit="1"]');
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    await expect.poll(() => creates.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const attrs = (creates[0]!.body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.vin).toBe(VALID_VIN);
    // The exact challenge-bound authority envelope must reach the server:
    expect(attrs.vinChallenge).toBeTruthy();
    expect(attrs.vinConfirmedReviewId).toBeTruthy();
    expect(attrs.vinConfirmationReceipt).toBeTruthy();
    expect(attrs.vinConfirmationIssuedAt).toBeTruthy();
    expect(attrs.vinConfirmationExpiresAt).toBeTruthy();
    // The publish cover upload went through the stub — no real external traffic:
    await expect.poll(() => uploads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(uploads[0]!.body.action).toBe("upload_media");
  });

  test("failed/forged flow: forged confirm → typed error, review stays open; reject → publish payload omits the VIN", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
      rejectConfirms: true,
    });
    const creates = installListingCreateCapture(page);
    const uploads = await installMediaUploadStub(page);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Pre-decision: review card visible, PrePublish modal absent.
    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

    // Forged confirm → typed error surfaced in chat; the review STAYS open.
    await card.getByRole("button", { name: "Patvirtinti VIN" }).click();
    await expect(page.locator(".agent-chat-strip")).toContainText("nerasta", { timeout: 10_000 });
    await expect(card).toHaveCount(1);
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

    // The human rejects the candidate → no VIN authority is granted.
    await card.getByRole("button", { name: "Nežinau VIN" }).click();
    await expect(card).toHaveCount(0);

    // Only now the PrePublish modal may appear (complete draft, NO vin).
    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await makePublishable(page);
    const publishBtn = modal.locator('[data-prepublish-submit="1"]');
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    await expect.poll(() => creates.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const attrs = (creates[0]!.body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.vin).toBeUndefined();
    // No accidental authorization: the rejected confirm must leave NO authority
    // token in the outgoing payload:
    expect(attrs.vinConfirmationReceipt).toBeUndefined();
    expect(attrs.vinConfirmationIssuedAt).toBeUndefined();
    expect(attrs.vinConfirmationExpiresAt).toBeUndefined();
    expect(attrs.vinConfirmedReviewId).toBeUndefined();
    // The publish cover upload went through the stub — no real external traffic:
    await expect.poll(() => uploads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(uploads[0]!.body.action).toBe("upload_media");
  });

  // ── Server-scoped challenge-binding contract (R5) — the modal VIN review
  //    block drives the REAL register/confirm endpoints. This is the
  //    authority proof and must stay separate from the card-first UI tests.
  test("create flow (server-scoped VIN kontraktas): register → confirm su gautu challengeId → publish payload su visa autoriteto envelope", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { registerCalls, confirmCalls } = await installVinEndpoints(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
      modalVinReviewOnly: true,
    });
    const creates = installListingCreateCapture(page);
    const uploads = await installMediaUploadStub(page);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // No trusted review payload → the standalone card must NOT exist, and
    // the PrePublish modal appears (complete draft at AWAITING_CONFIRMATION).
    await expect(page.locator('[data-vin-review-card="1"]')).toHaveCount(0);
    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 20_000 });

    const vinInput = page.locator('input[placeholder="17 simbolių VIN"]');
    await expect(vinInput).toBeVisible();
    await vinInput.fill(VALID_VIN);

    const confirmBtn = modal.getByRole("button", { name: "Patvirtinti VIN" });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 1. register request occurred, with the typed VIN:
    await expect.poll(() => registerCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(registerCalls[0]!.body.values).toEqual([VALID_VIN]);

    // 2. confirm uses the challenge the server just returned:
    await expect.poll(() => confirmCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const challengeId = registerCalls[0] ? `vc_1` : "never";
    expect(confirmCalls[0]!.body.challengeId).toBe(challengeId);
    expect(confirmCalls[0]!.body.value).toBe(VALID_VIN);

    // 3. visible success: the pending-review block disappears:
    await expect(modal.locator('[data-vin-modal-review="1"]')).toHaveCount(0);

    // 4. publish preparation carries the challenge-bound authority:
    await makePublishable(page);
    const publishBtn = modal.locator('[data-prepublish-submit="1"]');
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    await expect.poll(() => creates.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const attrs = (creates[0]!.body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.vin).toBe(VALID_VIN);
    // The exact challenge-bound authority envelope must reach the server:
    expect(attrs.vinChallenge).toBeTruthy();
    expect(attrs.vinDraftScope).toBeTruthy();
    expect(attrs.vinConfirmedReviewId).toBeTruthy();
    expect(attrs.vinConfirmationReceipt).toBeTruthy();
    expect(attrs.vinConfirmationIssuedAt).toBeTruthy();
    expect(attrs.vinConfirmationExpiresAt).toBeTruthy();
    // The publish cover upload went through the stub — no real external traffic:
    await expect.poll(() => uploads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(uploads[0]!.body.action).toBe("upload_media");
  });

  test("failed/forged flow (server-scoped): neteisingas challenge atmetamas → typed error → VIN nepatenka į publish payload", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { confirmCalls, state } = await installVinEndpoints(page);
    state.rejectAllConfirms = true;
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
      modalVinReviewOnly: true,
    });
    const creates = installListingCreateCapture(page);
    const uploads = await installMediaUploadStub(page);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    await expect(page.locator('[data-vin-review-card="1"]')).toHaveCount(0);
    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 20_000 });

    const vinInput = page.locator('input[placeholder="17 simbolių VIN"]');
    await expect(vinInput).toBeVisible();
    await vinInput.fill(VALID_VIN);
    await modal.getByRole("button", { name: "Patvirtinti VIN" }).click();

    // The confirm request DID occur and was rejected by the server contract:
    await expect.poll(() => confirmCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);

    // Visible failure state:
    const alert = modal.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText("nerasta");

    // Publish preparation must omit the unconfirmed VIN:
    await makePublishable(page);
    const publishBtn = modal.locator('[data-prepublish-submit="1"]');
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    await expect.poll(() => creates.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const attrs = (creates[0]!.body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.vin).toBeUndefined();
    // No accidental authorization: the rejected confirm must leave NO authority
    // token in the outgoing payload:
    expect(attrs.vinChallenge).toBeUndefined();
    expect(attrs.vinConfirmedReviewId).toBeUndefined();
    expect(attrs.vinConfirmationReceipt).toBeUndefined();
    expect(attrs.vinConfirmationIssuedAt).toBeUndefined();
    expect(attrs.vinConfirmationExpiresAt).toBeUndefined();
    // The publish cover upload went through the stub — no real external traffic:
    await expect.poll(() => uploads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(uploads[0]!.body.action).toBe("upload_media");
  });

  test("existing listing edit: replacement registers with the REAL listingId, confirms listing-bound, and the PATCH carries the authority", async ({ page }) => {
    const listing = buildOwnedListing({
      id: EDIT_LISTING_ID,
      slug: "e2e-edit-vin-vilnius",
      category: "vehicles",
      title: "E2E BMW 320d",
      attributes: {
        vin: "WBA3B1C59DP123456",
        make: "BMW",
        model: "320d",
        year: "2012",
        mileage: "180000",
        fuelType: "Dyzelinas",
        galleryUrls: ["https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/e2e/cover-a.jpg"],
      },
    });
    await seedSellerWithOwnedListing(page, listing);
    const { registerCalls, confirmCalls } = await installVinEndpoints(page);
    const patches = installListingPatchCapture(page);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);

    const editBtn = page.getByRole("button", { name: "Redaguoti" }).first();
    await expect(editBtn).toBeVisible({ timeout: 20_000 });
    await editBtn.click();

    const modal = page.locator('[data-edit-listing-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 20_000 });
    const vinInput = page.locator('[data-edit-vin-input="1"]');
    await expect(vinInput).toBeVisible();
    await expect(vinInput).toHaveValue("WBA3B1C59DP123456");

    await vinInput.fill(ALT_VIN);
    const confirmBtn = page.locator('[data-edit-vin-confirm="1"]');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Registration carries the real authorized listing id:
    await expect.poll(() => registerCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(registerCalls[0]!.body.listingId).toBe(EDIT_LISTING_ID);
    expect(registerCalls[0]!.body.values).toEqual([ALT_VIN]);

    // Confirmation submits the SAME listing id:
    await expect.poll(() => confirmCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(confirmCalls[0]!.body.listingId).toBe(EDIT_LISTING_ID);
    expect(confirmCalls[0]!.body.value).toBe(ALT_VIN);

    // Visible success: review block gone:
    await expect(page.locator('[data-edit-vin-review="1"]')).toHaveCount(0);

    // Save → the PATCH carries the listing-bound authority:
    const saveBtn = page.locator('[data-edit-save="1"]');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const patchBody = patches.find((p) => p.url.includes(EDIT_LISTING_ID));
    expect(patchBody).toBeTruthy();
    const attrs = (patchBody!.body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.vin).toBe(ALT_VIN);
    expect(attrs.vinConfirmationReceipt).toBeTruthy();
  });

  test("agent card: deterministic server candidate → VinReviewCard renders → structured confirm → card resolves", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "DRAFT_READY",
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    // Drive a user message through the real chat composer:
    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The real VinReviewCard renders from the trusted payload:
    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(VALID_VIN);

    // F12/VIN — independent card states: the PrePublish-ready draft state
    // must NEVER suppress the active VIN review card in the DOM.
    await expect(card).toHaveCount(1);

    // Confirm through the card:
    await card.getByRole("button", { name: "Patvirtinti VIN" }).click();

    // The structured action reached the server (request body context):
    await expect
      .poll(
        () =>
          sentAgentBodies.some(
            (c) =>
              ((c.body.context as Record<string, unknown>)?.vinReviewAction as
                | { type?: string }
                | undefined)?.type === "confirm"
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    // Visible success: the card disappears and the assistant confirms:
    await expect(card).toHaveCount(0);
    await expect(page.locator(".agent-chat-strip")).toContainText("patvirtintas", { ignoreCase: true });
  });

  test("F12/VIN adversarial: forged vin/vinConfirmed markers be trusted vinReview payload → kortelės nesukuria", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "DRAFT_READY",
      untrustedVinMarkers: true,
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The assistant reply is visible, but raw attribute markers can never
    // mint the trusted VIN review card.
    await expect(
      page.locator(".agent-chat-strip .agent-chat-bubble-assistant")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-vin-review-card="1"]')).toHaveCount(0);
  });

  test("F9 fail-closed: pilnas transporto draft be būklės → PrePublish kortelė lieka uždaryta", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
      omitCondition: true,
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    // The chat message MUST reach the agent (stubbed) — fail otherwise:
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The assistant reply is visible, but the incomplete vehicles draft
    // (missing condition) must NEVER open the PrePublish modal:
    await expect(
      page.locator(".agent-chat-strip .agent-chat-bubble-assistant")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);
  });

  /**
   * Differential control: the SAME complete AWAITING_CONFIRMATION draft as
   * the reviewed rows, but WITHOUT any VIN review. The PrePublish modal MUST
   * open here — that proves the client really set `listingPublishConfirmed =
   * true` on this exact draft path (the only client path that sets it), so
   * the with-review rows below suppress a genuinely open-ready modal.
   */
  test("diferencialinė kontrolė: pilnas AWAITING_CONFIRMATION draft be VIN peržiūros → listingPublishConfirmed=true ir modalas pasirodo", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
      noVinAttrs: true,
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    await expect(page.locator('[data-vin-review-card="1"]')).toHaveCount(0);
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({ timeout: 20_000 });
  });

  /**
   * F12/VIN — card-priority matrix: a trusted pendingVinReview must suppress
   * the PrePublish modal in EVERY flow state until the human decides.
   */
  const priorityRows: Array<{
    name: string;
    flowState: "DRAFT_READY" | "AWAITING_CONFIRMATION";
    omitCondition?: boolean;
    expectModalAfterConfirm: boolean;
  }> = [
    {
      name: "DRAFT_READY + pendingVinReview",
      flowState: "DRAFT_READY",
      expectModalAfterConfirm: true,
    },
    {
      // listingPublishConfirmed=true is REALLY set on this path (the client's
      // only setter fires at AWAITING_CONFIRMATION + complete draft) — proven
      // by the differential control test above, whose only delta is the
      // review payload.
      name: "AWAITING_CONFIRMATION + listingPublishConfirmed=true + pendingVinReview",
      flowState: "AWAITING_CONFIRMATION",
      expectModalAfterConfirm: true,
    },
    {
      name: "AWAITING_CONFIRMATION + pendingVinReview + nepilnas draft (be būklės)",
      flowState: "AWAITING_CONFIRMATION",
      omitCondition: true,
      expectModalAfterConfirm: false,
    },
  ];

  for (const row of priorityRows) {
    test(`VIN kortelės prioritetas: ${row.name}`, async ({ page }) => {
      await forceOfflineCatalog(page);
      await seedDemoUser(page);
      const { sentAgentBodies } = await installAgentStreamStub(page, {
        candidateFlowState: row.flowState,
        omitCondition: row.omitCondition,
      });

      await page.goto("/");
      await acceptGdprConsentIfPrompted(page);
      await openAgentChatOnHome(page);

      const composer = chatComposer(page);
      await expect(composer).toBeVisible();
      await composer.fill("Parduodu BMW");
      await composer.press("Enter");

      await expect
        .poll(() => sentAgentBodies.length, { timeout: 15_000 })
        .toBeGreaterThan(0);

      // Pre-decision: the review card is the ONLY surface.
      const card = page.locator('[data-vin-review-card="1"]');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toHaveCount(1);
      await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

      // The human confirms the candidate.
      await card.getByRole("button", { name: "Patvirtinti VIN" }).click();
      await expect(card).toHaveCount(0);

      // Post-decision: the modal appears IFF the F9 gates are satisfied.
      const modal = page.locator('[data-prepublish-modal="1"]');
      if (row.expectModalAfterConfirm) {
        await expect(modal).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(modal).toHaveCount(0);
      }
    });
  }

  test("F12/VIN adversarial: nesusijęs turnas aktyvaus trusted kandidato neištrina", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "DRAFT_READY",
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

    // An unrelated chat turn must NOT clear the open review. The stub emits
    // the candidate ONLY on the first turn — follow-ups answer with an empty
    // action, so the card below can only survive by PRESERVATION, never by
    // the stub regenerating the candidate.
    await composer.fill("Papildyk aprašymą");
    await composer.press("Enter");
    await expect(card).toHaveCount(1);
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);
  });

  test("F12/VIN adversarial: double-click nesukelia dvigubo confirm", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "DRAFT_READY",
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Rapid double activation — the second click lands while the client is
    // busy (button disabled) and must be ignored, never a second confirm.
    await card.getByRole("button", { name: "Patvirtinti VIN" }).dblclick();

    await expect(card).toHaveCount(0);
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(1);
    const confirmActions = sentAgentBodies.filter(
      (c) =>
        ((c.body.context as Record<string, unknown>)?.vinReviewAction as
          | { type?: string }
          | undefined)?.type === "confirm"
    );
    expect(confirmActions.length).toBe(1);
  });

  /**
   * F12/VIN — `listingPublishConfirmed=true + pendingVinReview` through a
   * REAL two-turn user path: turn 1 sets the boolean true (the client's only
   * setter fires at AWAITING_CONFIRMATION + complete draft — proven by the
   * differential control test); turn 2 is a LOCAL condition-word turn that
   * transitions the flow state to DRAFT_READY WITHOUT resetting the boolean
   * (local draft patches do not touch it) and WITHOUT touching the open
   * review (review sync runs only on streamed listing_draft actions — the
   * stub answers turn 2 with an empty action). While the review is open the
   * modal must not exist even though BOTH `listingPublishConfirmed` and
   * `DRAFT_READY` clauses would open it.
   */
  test("VIN kortelės prioritetas: listingPublishConfirmed=true + pendingVinReview (boolean nustatytas realiu AWAITING keliu, būsena perėjo vietiniu turnu)", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAgentChatOnHome(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu BMW");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Turn 1 → AWAITING_CONFIRMATION + complete → listingPublishConfirmed=true
    // (real path) + trusted review open:
    const card = page.locator('[data-vin-review-card="1"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveCount(1);
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);
    await expect(composer).toHaveAttribute("placeholder", /Patikslinkite čia/);

    // Turn 2 — a local condition answer transitions the flow state to
    // DRAFT_READY; the boolean is NOT reset and the review is NOT cleared.
    await composer.fill("Naudota");
    await composer.press("Enter");

    // Deterministic proof the transition really happened: the composer
    // placeholder switches to the DRAFT_READY one.
    await expect(composer).toHaveAttribute("placeholder", /Parašykite kainą, lokaciją/, { timeout: 15_000 });

    // The review stays open; the modal must stay out of the DOM even though
    // `listingPublishConfirmed=true` AND `DRAFT_READY` are both active.
    await expect(card).toHaveCount(1);
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);

    // The human decides → only then the modal appears (F9 gates ok).
    await card.getByRole("button", { name: "Patvirtinti VIN" }).click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({ timeout: 20_000 });
  });
});
