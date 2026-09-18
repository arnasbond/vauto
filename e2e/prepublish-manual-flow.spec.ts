/**
 * FC-UX P1 — executable proof of the REAL manual (no-AI) listing entry.
 *
 * Reproduces the actual product path: guest opens /add → clicks the visible
 * "Užpildyti viską pačiam" CTA → completes phone OTP auth → the app redirects
 * client-side to manual mode → the incomplete editor opens → an incomplete
 * draft cannot publish. No provider/LLM call is required anywhere in this path.
 */
import { test, expect, type Page } from "@playwright/test";

const E2E_USER = {
  id: "user-e2e-manual",
  name: "E2E Manual",
  nickname: "E2E Manual",
  phone: "+37060000001",
  city: "Vilnius",
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
  role: "private",
  profileType: "private",
  walletBalance: 0,
};

async function installMocks(page: Page) {
  // --- Auth: phone OTP ---
  await page.route("**/api/auth/otp/send**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/auth/otp/verify**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "e2e-seeded-session",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        user: E2E_USER,
      }),
    });
  });
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: E2E_USER, role: "private", userId: E2E_USER.id, provider: "phone" }),
    });
  });
  await page.route(/vauto-api\.onrender\.com\/api\/auth\/session/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: E2E_USER, role: "private", userId: E2E_USER.id, provider: "phone" }),
    });
  });

  // --- Profile / onboarding ---
  await page.route("**/api/user/onboarding**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ onboarding: { step: 3, completedAt: new Date().toISOString(), answers: {} } }),
    });
  });
  await page.route("**/api/user**", async (route) => {
    if (route.request().url().includes("/onboarding")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ onboarding: { step: 3, completedAt: new Date().toISOString(), answers: {} } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: E2E_USER }),
    });
  });

  // --- No agent / no listings dependency ---
  await page.route("**/api/vauto-agent**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "", actions: { type: "none" } }),
    });
  });
  await page.route("**/api/listings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-manual-1",
          title: "Manual listing",
          price: 100,
          location: "Vilnius",
          category: "other",
          images: [],
          slug: "e2e-manual",
          status: "active",
          sellerId: E2E_USER.id,
          createdAt: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("FC-UX manual listing flow (no AI)", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("guest clicks Užpildyti viską pačiam → OTP auth → manual editor opens (incomplete)", async ({ page }) => {
    await installMocks(page);
    await page.goto("/add", { waitUntil: "domcontentloaded" });

    // Real visible CTA (guest funnel).
    const manualCta = page.locator('[data-seller-start-manual]');
    await expect(manualCta).toBeVisible({ timeout: 30_000 });
    await manualCta.click();

    // Phone OTP auth modal.
    const phoneBtn = page.getByRole("button", { name: /Prisijungti telefonu/i });
    await expect(phoneBtn).toBeVisible({ timeout: 15_000 });
    await phoneBtn.click();

    const phoneInput = page.locator("#vauto-auth-phone");
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill("+370 600 00001");

    const sendBtn = page.getByRole("button", { name: /Siųsti kodą/i });
    await expect(sendBtn).toBeEnabled({ timeout: 15_000 });
    await sendBtn.click();

    const otpInput = page.locator("#vauto-auth-otp");
    await expect(otpInput).toBeVisible({ timeout: 15_000 });
    await otpInput.fill("123456");

    const confirmBtn = page.getByRole("button", { name: /Patvirtinti ir prisijungti/i });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Client-side redirect to manual mode opens the full editor for the
    // INCOMPLETE seed draft (before the fix this modal never rendered).
    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 30_000 });

    // The editor exposes editable core fields.
    await expect(modal.locator('input[type="text"]').first()).toBeVisible();
    await expect(modal.locator('input[type="number"]').first()).toBeVisible();

    // INCOMPLETE draft cannot publish: the submit CTA stays disabled (no photos
    // / no price) until the seller actually completes the listing.
    await expect(modal.locator('[data-prepublish-submit="1"]')).toBeDisabled();

    // No auto-publish / no success plane.
    await expect(page.locator(".animate-paper-plane-fly")).toHaveCount(0);
  });
});
