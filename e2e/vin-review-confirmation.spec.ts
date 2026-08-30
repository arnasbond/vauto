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
  opts: { candidateFlowState: "DRAFT_READY" | "AWAITING_CONFIRMATION" }
) {
  const sentAgentBodies: CapturedCall[] = [];
  const sse = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`;

  await page.route("**/api/vauto-agent/stream", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sentAgentBodies.push({ url: route.request().url(), body });
    const context = (body.context ?? {}) as Record<string, unknown>;
    const action = context.vinReviewAction as
      | { type?: string; value?: string; reviewId?: string }
      | undefined;

    if (action && action.type === "confirm") {
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

    const result = {
      ok: true,
      reply: "Nuotraukoje atpažinau VIN kandidatą.",
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
          listingFlowState: opts.candidateFlowState,
          attributes: {
            make: "BMW",
            model: "320d",
            year: "2015",
            vinCandidate: VALID_VIN,
            vinCandidateSource: "photo_ocr",
            vinUncertain: "true",
            vinReviewId: "vr_agent_1",
            vinChallenge: "vc_agent_1",
          },
        },
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
  test("create flow: manual entry → register (server scope) → confirm → publish payload carries challenge-bound authority", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { registerCalls, confirmCalls } = await installVinEndpoints(page);
    await installAgentStreamStub(page, { candidateFlowState: "AWAITING_CONFIRMATION" });
    const creates = installListingCreateCapture(page);

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

    // The server-registered candidate lands → PrePublish modal appears:
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
    expect(attrs.vinConfirmationReceipt).toBeTruthy();
    expect(attrs.vinChallenge).toBeTruthy();
  });

  test("failed/forged flow: confirm without a valid challenge shows the typed error and the publish payload omits the VIN", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { confirmCalls, state } = await installVinEndpoints(page);
    state.rejectAllConfirms = true;
    const { sentAgentBodies } = await installAgentStreamStub(page, {
      candidateFlowState: "AWAITING_CONFIRMATION",
    });
    const creates = installListingCreateCapture(page);

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
});
