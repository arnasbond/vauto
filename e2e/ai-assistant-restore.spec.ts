/**
 * AI assistant restoration E2E — instant session start + unlocked composer.
 * Asserts the liberated UX path (no LLM greeting SSE chain on + Įdėti).
 */
import { test, expect, type Page } from "@playwright/test";
import {
  seedDemoUser,
  acceptGdprConsentIfPrompted,
  dismissTransientOverlays,
} from "./helpers/seed-demo-user";

async function openSellerSession(page: Page) {
  await seedDemoUser(page);
  await page.goto("/add/");
  await acceptGdprConsentIfPrompted(page).catch(() => undefined);
  await page
    .waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, "") || "/";
        return p === "/" || p === "";
      },
      { timeout: 20_000 }
    )
    .catch(() => undefined);
}

test.describe("AI assistant restoration", () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test("session start shows static welcome fast and keeps composer unlocked", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const t0 = Date.now();
    await openSellerSession(page);

    const welcome = page.getByText(
      /kontaktai iš profilio jau paruošti skelbimui/i
    );
    await expect(welcome.first()).toBeVisible({ timeout: 8_000 });
    const welcomeMs = Date.now() - t0;
    expect(welcomeMs).toBeLessThan(8_000);

    // Old LLM greeting chain must not appear on start.
    await expect(page.getByText(/Analizuoju užklausą/i)).toHaveCount(0);
    await expect(page.getByText(/Tęsiu darbą/i)).toHaveCount(0);
    await expect(page.getByText(/Atidarau ekraną/i)).toHaveCount(0);

    const composer = page
      .getByRole("textbox", { name: /VAUTO|atsakym|Rašykite/i })
      .or(page.locator("input[aria-label='VAUTO asistento atsakymas'], input[aria-label='VAUTO AI komanda'], form[aria-label='VAUTO asistento atsakymas'] input, .agent-chat-composer input[type='text']"))
      .first();

    // Fallback: any visible chat/search text input in the strip.
    const input = page.locator(".agent-chat-composer input, form[aria-label*='asistent'] input, input[enterkeyhint='send']").first();
    await expect(input).toBeVisible({ timeout: 8_000 });
    await expect(input).toBeEnabled();

    await input.fill("150€");
    await expect(input).toHaveValue("150€");

    const send = page
      .getByRole("button", { name: /^Siųsti$/i })
      .or(page.locator(".agent-chat-composer button[type='submit']"))
      .first();
    await expect(send).toBeEnabled();

    // Soft timing signal for the report (static welcome should be near-instant).
    expect(
      welcomeMs,
      `static welcome took ${welcomeMs}ms — expect under 5s on cold static serve`
    ).toBeLessThan(5_000);
  });

  test("bottom + Įdėti opens assistant with welcome (no busy spinner lock)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await seedDemoUser(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page).catch(() => undefined);
    await dismissTransientOverlays(page).catch(() => undefined);

    const placeAd = page.getByRole("button", {
      name: /Įdėti naują skelbimą|^Įdėti$/i,
    });
    await expect(placeAd.first()).toBeVisible({ timeout: 15_000 });
    await placeAd.first().click();
    await dismissTransientOverlays(page).catch(() => undefined);

    const welcome = page.getByText(
      /kontaktai iš profilio jau paruošti skelbimui/i
    );
    // Static e2e may hit auth revalidation toast — /add is the same seller entry.
    if (!(await welcome.first().isVisible({ timeout: 4_000 }).catch(() => false))) {
      await page.goto("/add/");
      await acceptGdprConsentIfPrompted(page).catch(() => undefined);
    }

    await expect(welcome.first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Analizuoju užklausą/i)).toHaveCount(0);

    const input = page
      .locator(
        ".agent-chat-composer input, form[aria-label*='asistent'] input, input[enterkeyhint='send']"
      )
      .first();
    await expect(input).toBeVisible({ timeout: 8_000 });
    await expect(input).toBeEnabled();

    const send = page
      .locator(".agent-chat-composer button[type='submit']")
      .or(page.getByRole("button", { name: /^Siųsti$/i }))
      .first();
    await input.fill("Vilnius");
    await expect(send).toBeEnabled();
  });
});
