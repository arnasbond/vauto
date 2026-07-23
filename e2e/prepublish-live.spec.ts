/**
 * Live E2E: phone login → Vision OCR → sales copy → PrePublish → publish.
 *
 * Prerequisites: `npm run dev` on :3000
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test --config=playwright.live.config.ts
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { acceptGdprConsentIfPrompted } from "./helpers/seed-demo-user";

const ROOT = path.resolve(__dirname, "..");
const CITROEN_DIR = path.join(ROOT, "public", "e2e-citroen");
/** Include tech passport (c1) + exterior + interior — real seller mix. */
const PHOTO_FILES = ["c1.png", "c2.png", "c3.png", "c12.png"]
  .map((name) => path.join(CITROEN_DIR, name))
  .filter((p) => fs.existsSync(p));

const TEST_PHONE = "+37060000002";
const TEST_OTP = "123456";

async function installPublishMocks(page: Page) {
  await page.route("**/api/listings", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-live-listing-1",
        title: "Citroën Grand C4 Picasso 2007",
        price: 2250,
        location: "Vilnius",
        category: "vehicles",
        images: ["/e2e-citroen/c2.png"],
        slug: "e2e-citroen-grand-c4",
        status: "active",
        sellerId: "user-e2e-test",
        createdAt: new Date().toISOString(),
      }),
    });
  });
  await page.route("**/api/upload**", async (route: Route) => {
    if (route.request().method() === "POST" || route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          url: "https://res.cloudinary.com/demo/image/upload/e2e-citroen.jpg",
        }),
      });
      return;
    }
    await route.continue();
  });
}

async function loginWithTestPhone(page: Page) {
  await page.goto("/add/");
  await acceptGdprConsentIfPrompted(page);

  // Already authenticated from a prior run / storage seed.
  const addHeading = page.getByRole("heading", {
    name: /Kelkite skelbimą pokalbyje|Kelkite drabužį pokalbyje/i,
  });
  if (await addHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  const phoneLogin = page.getByRole("button", { name: /Prisijungti telefonu/i });
  if (await phoneLogin.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await phoneLogin.click();
  } else {
    const loginBtn = page.getByRole("button", { name: /Prisijungti/i }).first();
    await expect(loginBtn).toBeVisible({ timeout: 20_000 });
    await loginBtn.click();
    await phoneLogin.click({ timeout: 10_000 });
  }

  const phoneInput = page.getByPlaceholder(/370/).first();
  await expect(phoneInput).toBeVisible({ timeout: 15_000 });
  await phoneInput.click();
  await phoneInput.fill(TEST_PHONE);
  const phoneVal = await phoneInput.inputValue();
  if (!/60000002/.test(phoneVal.replace(/\s/g, ""))) {
    await phoneInput.pressSequentially("60000002", { delay: 40 });
  }
  await page.getByRole("button", { name: /Siųsti kodą/i }).click();

  await expect(
    page.getByText(/Patvirtinkite SMS kodą|SMS kod/i).first()
  ).toBeVisible({ timeout: 45_000 });
  const otp = page
    .getByPlaceholder("••••••")
    .or(page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]'))
    .first();
  await otp.fill(TEST_OTP);
  await page.getByRole("button", { name: /Patvirtinti ir prisijungti/i }).click();

  await expect(addHeading).toBeVisible({ timeout: 90_000 });
}

async function attachPhotos(page: Page) {
  expect(PHOTO_FILES.length).toBeGreaterThanOrEqual(2);

  // Ensure we are on /add for the auto-send photo path (pickAndSendChatPhotos).
  if (!/\/add\/?$/.test(new URL(page.url()).pathname)) {
    await page.goto("/add/");
  }
  await expect(
    page.getByRole("heading", { name: /Kelkite skelbimą pokalbyje/i })
  ).toBeVisible({ timeout: 30_000 });

  const consentEarly = page.getByRole("button", { name: /^Sutinku$/i });
  if (await consentEarly.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await consentEarly.click();
  }

  const photoBtn = page.getByRole("button", { name: /Įkelti nuotraukas/i }).first();
  await expect(photoBtn).toBeEnabled({ timeout: 15_000 });

  // Start chooser wait BEFORE click to avoid races; consent may open first.
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 60_000 });
  await photoBtn.click();
  const consent = page.getByRole("button", { name: /^Sutinku$/i });
  if (await consent.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await consent.click();
  }
  const chooser = await chooserPromise;
  await chooser.setFiles(PHOTO_FILES.slice(0, 3));

  // Compression runs before navigateBeforeSend. Use Promise.any so a single timeout
  // rejection does not abort the other waiter (Promise.race pitfall).
  const agent = page.getByLabel(/VAUTO asistento pokalbis/i);
  await Promise.any([
    page
      .waitForURL(
        (url) => {
          const p = url.pathname.replace(/\/$/, "") || "/";
          return p === "/" || p === "";
        },
        { timeout: 180_000 }
      )
      .then(() => "home" as const),
    agent
      .getByText(/Nuotraukos įkeltos|Nuotrauka 1|Prisegtos nuotraukos/i)
      .first()
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => "photos" as const),
  ]);

  if (!(await agent.isVisible().catch(() => false))) {
    const writeBtn = page.getByRole("button", { name: /Rašyti asistentui/i });
    if (await writeBtn.isVisible().catch(() => false)) {
      await writeBtn.click();
    }
  }

  await expect(agent).toBeVisible({ timeout: 90_000 });
  await expect(
    agent.getByText(/Nuotraukos įkeltos|Nuotrauka 1|Prisegtos nuotraukos/i).first()
  ).toBeVisible({ timeout: 90_000 });
}

/** If remote API still emits car+passport chips, pick car without local PrePublish short-circuit. */
async function resolveMultiObjectIfNeeded(page: Page) {
  const agent = page.getByLabel(/VAUTO asistento pokalbis/i);
  const carChip = agent.getByRole("button", { name: /Parduoti automobil/i });
  const passportChip = agent.getByRole("button", {
    name: /Parduoti techninis|Parduoti.*pasas/i,
  });
  const hasPassport = await passportChip.isVisible({ timeout: 8_000 }).catch(() => false);
  const hasCar = await carChip.isVisible({ timeout: 2_000 }).catch(() => false);
  if (hasPassport && hasCar) {
    const composer = agent
      .getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
      .first();
    await expect(composer).toBeEnabled({ timeout: 30_000 });
    await composer.click();
    await composer.fill(
      "Parduodu automobilį. Techninis pasas tik OCR specifikacijoms, ne atskiras skelbimas."
    );
    await composer.press("Enter");
  }
}

test.describe("Live PrePublish flow (OCR → sales copy → publish)", () => {
  test.setTimeout(480_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("full seller path with citroen fixtures", async ({ page }, testInfo) => {
    test.skip(PHOTO_FILES.length < 2, "Missing public/e2e-citroen fixtures");

    await page.addInitScript(() => {
      localStorage.setItem("vauto_gdpr_consent_v1", JSON.stringify(true));
      localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
    });
    await installPublishMocks(page);
    await loginWithTestPhone(page);
    await page.screenshot({
      path: testInfo.outputPath("01-logged-in-add.png"),
      fullPage: true,
    });

    await attachPhotos(page);
    await page.screenshot({
      path: testInfo.outputPath("02-photos-attached.png"),
      fullPage: true,
    });

    // Re-resolve after screenshot — agent strip can remount on soft nav.
    let agent = page.getByLabel(/VAUTO asistento pokalbis/i);
    if (!(await agent.isVisible().catch(() => false))) {
      const writeBtn = page.getByRole("button", { name: /Rašyti asistentui/i });
      if (await writeBtn.isVisible().catch(() => false)) await writeBtn.click();
      else await page.goto("/");
      agent = page.getByLabel(/VAUTO asistento pokalbis/i);
    }
    await expect(agent).toBeVisible({ timeout: 90_000 });

    // Wait until first vision turn finishes (composer unlocks).
    await expect(
      agent.getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
    ).toBeEnabled({ timeout: 240_000 });

    await resolveMultiObjectIfNeeded(page);

    await expect(
      agent.getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
    ).toBeEnabled({ timeout: 240_000 });

    // Live Render copy varies: markdown specs OR fused sales tip with Publikuojam CTA.
    const step1OrReady = agent
      .getByText(
        /Pagrindiniai duomenys|Ar norėtumėte, kad pagal šiuos duomenis|Patarimas|Kaišiadorys|LJP\s*935|2007-07-24|Grand C4|Citro[eë]n|ratlank|Kai tekstas tinka|Publikuojam/i
      )
      .first();
    await expect(step1OrReady).toBeVisible({ timeout: 240_000 });

    const bodyText = await agent.innerText();
    expect(bodyText.toLowerCase()).not.toMatch(/ta galioja\s*2\s*met/);
    await page.screenshot({
      path: testInfo.outputPath("03-step1-ocr-report.png"),
      fullPage: true,
    });

    const tinkaEarly = agent.getByRole("button", { name: /^Tinka$/i });
    const publikuojamEarly = agent.getByRole("button", { name: /Publikuojam/i });
    const keliamEarly = agent.getByRole("button", { name: /^Keliam$/i });
    const hasPublishChips = await tinkaEarly
      .or(publikuojamEarly)
      .or(keliamEarly)
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasPublishChips) {
      const taipChip = agent.getByRole("button", { name: /^Taip/i }).first();
      if (await taipChip.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await taipChip.click();
      } else {
        const composer = agent
          .getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
          .first();
        await expect(composer).toBeEnabled({ timeout: 60_000 });
        await composer.fill("Taip, paruošk skelbimą");
        await composer.press("Enter");
      }
      await expect(
        agent
          .getByText(
            /Parduodamas|Pagrindiniai privalumai|Jeigu tekstas tinka|Kai tekstas tinka|Patarimas|Publikuojam/i
          )
          .first()
      ).toBeVisible({ timeout: 180_000 });
    }

    const tinka = agent.getByRole("button", { name: /^Tinka$/i });
    const publikuojam = agent.getByRole("button", { name: /Publikuojam/i });
    const keliam = agent.getByRole("button", { name: /^Keliam$/i });
    // Chips may be absent if CTA is text-only — type Publikuojam.
    if (
      !(await tinka.or(publikuojam).or(keliam).first().isVisible().catch(() => false))
    ) {
      const composer = agent
        .getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
        .first();
      await expect(composer).toBeEnabled({ timeout: 30_000 });
      await composer.fill("Publikuojam");
      await composer.press("Enter");
    } else if (await publikuojam.isVisible().catch(() => false)) {
      await publikuojam.click();
    } else if (await tinka.isVisible().catch(() => false)) {
      await tinka.click();
    } else {
      await keliam.click();
    }

    await page.screenshot({
      path: testInfo.outputPath("04-step2-sales-copy.png"),
      fullPage: true,
    });

    const modal = page.locator('[data-prepublish-modal="1"]');
    const pricePrompt = agent.getByText(/Kokią kainą|kainą norėtumėte|sumą eurais/i);

    // Wait for either PrePublish modal OR price ask (anti-hallucination gate).
    await Promise.race([
      modal.waitFor({ state: "visible", timeout: 90_000 }),
      pricePrompt.waitFor({ state: "visible", timeout: 90_000 }),
    ]).catch(() => undefined);

    if (!(await modal.isVisible().catch(() => false))) {
      await expect(pricePrompt).toBeVisible({ timeout: 30_000 });
      const composer = agent
        .getByRole("textbox", { name: /Parašykite|kainą|PrePublish/i })
        .first();
      await expect(composer).toBeEnabled({ timeout: 30_000 });
      await composer.fill("2250");
      await composer.press("Enter");
      // Price alone should open PrePublish; if not, nudge once more.
      const appeared = await modal
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(() => true)
        .catch(() => false);
      if (!appeared) {
        await expect(composer).toBeEnabled({ timeout: 30_000 });
        await composer.fill("Publikuojam");
        await composer.press("Enter");
      }
    }

    await expect(modal).toBeVisible({ timeout: 90_000 });
    await expect(modal.getByText(/Free|Boost|Premium/i).first()).toBeVisible();

    const priceInput = modal.locator('input[type="number"]').first();
    if (await priceInput.isVisible()) {
      const val = await priceInput.inputValue();
      if (!val || Number(val) <= 0) await priceInput.fill("2250");
    }
    await page.screenshot({
      path: testInfo.outputPath("05-prepublish-modal.png"),
      fullPage: true,
    });

    const publishBtn = modal.locator('[data-prepublish-submit="1"]');
    await expect(publishBtn).toBeEnabled({ timeout: 15_000 });
    await publishBtn.click();
    await page
      .waitForSelector(".animate-paper-plane-fly", { timeout: 3_000 })
      .catch(() => null);
    await page.screenshot({
      path: testInfo.outputPath("06-after-publish-click.png"),
      fullPage: true,
    });

    await expect(page).toHaveURL(/mano-skelbimai/i, { timeout: 120_000 });
    await page.screenshot({
      path: testInfo.outputPath("07-published-redirect.png"),
      fullPage: true,
    });
  });
});
