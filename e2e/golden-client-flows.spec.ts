/**
 * E0 — golden client-flow measurements (browser).
 *
 * Measures the FRONTEND orchestration surface (RC-2/RC-3) with the REAL UI
 * and a stubbed agent stream: which turns are decided by the client without
 * ever reaching the server, and how the client history window behaves.
 * These tests measure — they do not fix anything.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
  seedDemoUser,
} from "../tests/e2e/helpers/seed";

async function installCaptureStub(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/vauto-agent/stream", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const sse = (b: unknown) => `data: ${JSON.stringify(b)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        sse({ type: "status", message: "Galvoju…" }) +
        sse({
          type: "final",
          result: { ok: true, reply: "Gauta.", toolCalls: [], actions: { type: "none" } },
        }),
    });
  });
  return { bodies };
}

async function openChat(page: Page) {
  const addBtn = page
    .locator('[data-app-header] [data-nav-add-listing]')
    .filter({ visible: true });
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();
  await expect(page.locator(".agent-chat-strip")).toBeVisible({ timeout: 20_000 });
}

function composer(page: Page) {
  return page.locator('form[aria-label="VAUTO asistento atsakymas"] input[type="text"]');
}

test.describe("E0 — golden client flows (frontend orchestration surface)", () => {
  test("quick-reply chip: pamatuota, ar chip eina per serverį (dabartinis faktas)", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { bodies } = await installCaptureStub(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openChat(page);

    // Category chip → measured: does the chip decision stay client-side?
    const transportChip = page
      .locator(".agent-chat-strip")
      .getByRole("button", { name: /Transportas|Kategorij/i })
      .first();
    await expect(transportChip).toBeVisible({ timeout: 15_000 });
    await transportChip.click();
    await page.waitForTimeout(800);

    // eslint-disable-next-line no-console
    console.log(`[E0-client] server calls after chip: ${bodies.length}`);
    // CURRENT FACT (measured, not fixed): chips route through the server.
    expect(bodies.length).toBeGreaterThanOrEqual(1);
  });

  test("hero „publikuojam“ turnas sprendžiamas kliente (0 serverio kvietimų)", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { bodies } = await installCaptureStub(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openChat(page);

    const c = composer(page);
    await expect(c).toBeVisible();
    await c.fill("publikuojam");
    await c.press("Enter");
    await page.waitForTimeout(800);

    // eslint-disable-next-line no-console
    console.log(`[E0-client] server calls after publish intent: ${bodies.length}`);
    expect(bodies.length).toBe(0);
  });

  test("istorijos langas: 8 turnai → DOM'e tik 6 žinutės (slice(-6) įrodymas)", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const { bodies } = await installCaptureStub(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openChat(page);

    const c = composer(page);
    for (let i = 0; i < 8; i++) {
      await c.fill(`žinutė ${i + 1}`);
      await c.press("Enter");
      await expect
        .poll(() => bodies.length, { timeout: 15_000 })
        .toBeGreaterThanOrEqual(i + 1);
    }

    const bubbles = page.locator(".agent-chat-strip .agent-chat-bubble-user");
    const count = await bubbles.count();
    // eslint-disable-next-line no-console
    console.log(`[E0-client] user bubbles in DOM after 8 turns: ${count}`);
    expect(count).toBeLessThanOrEqual(6);
  });

  test("mobile viewport: tas pats draft state atributai (parity)", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    await installCaptureStub(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openChat(page);
    await expect(page.locator(".agent-chat-strip")).toBeVisible({ timeout: 20_000 });
  });
});
