/**
 * R5 final — standalone manual (no-AI) listing path on /add.
 *
 * Proves the real product flow with ZERO provider/LLM calls:
 *   guest /add → "Prisijungti ir įkelti" → phone OTP → manual form opens →
 *   (incomplete cannot publish) → fill title/price/photo → publish → success.
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
  await page.route("**/api/auth/otp/send**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
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

  await page.route("**/api/user/onboarding", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ onboarding: { step: 3, completedAt: new Date().toISOString(), answers: {} } }),
    });
  });
  await page.route("**/api/user", async (route) => {
    if (route.request().url().includes("/onboarding")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ onboarding: { step: 3, completedAt: new Date().toISOString(), answers: {} } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: E2E_USER }) });
  });

  await page.route("**/api/vauto-agent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "", actions: { type: "none" } }),
    });
  });

  // Media upload stub (data: URL -> CDN URL).
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        action: "upload_media",
        url: "https://res.cloudinary.com/dhbrljo8v/image/upload/v1/vauto/e2e/cover-a.jpg",
        publicId: "e2e/cover-a",
        listingId: typeof body.listingId === "string" ? body.listingId : "e2e-listing",
        deferred: false,
        lazyUpload: false,
      }),
    });
  });

  await page.route("**/api/listings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-manual-1",
          title: "Dviratis",
          price: 150,
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
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
}

async function authViaPhoneOtp(page: Page) {
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
}

test.describe("R5 standalone manual listing (no AI)", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("guest /add → OTP auth → manual form opens (incomplete, cannot publish)", async ({ page }) => {
    await installMocks(page);
    await page.goto("/add", { waitUntil: "domcontentloaded" });

    const cta = page.locator('[data-manual-add-auth]');
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();

    await authViaPhoneOtp(page);

    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 30_000 });

    await expect(modal.locator('input[type="text"]').first()).toBeVisible();
    await expect(modal.locator('input[type="number"]').first()).toBeVisible();

    // Incomplete draft cannot publish (no photos / no price).
    await expect(modal.locator('[data-prepublish-submit="1"]')).toBeDisabled();
    await expect(page.locator('[data-manual-add-published="1"]')).toHaveCount(0);
  });

  test("complete the manual form → publish → success + open listing", async ({ page }) => {
    await installMocks(page);
    await page.goto("/add", { waitUntil: "domcontentloaded" });

    await expect(page.locator('[data-manual-add-auth]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-manual-add-auth]').click();
    await authViaPhoneOtp(page);

    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible({ timeout: 30_000 });

    // Title (first text input), price, and a photo.
    await modal.locator('input[type="text"]').first().fill("Dviratis");
    await modal.locator('input[type="number"]').first().fill("150");

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
      .poll(async () => modal.locator("img").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Publish becomes enabled once title + price + photo are present.
    const submit = modal.locator('[data-prepublish-submit="1"]');
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    // Success view with the published listing + open action.
    await expect(page.locator('[data-manual-add-published="1"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-manual-add-open-listing]')).toBeVisible();
  });
});
