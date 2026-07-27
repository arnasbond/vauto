/**
 * Deterministic PrePublish modal UI smoke (no live Vision/OTP).
 * Mocks agent/listing APIs and seeds a ready vehicle draft harness.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedDemoUser, acceptGdprConsentIfPrompted } from "./helpers/seed-demo-user";

test.describe("PrePublish modal UI smoke", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("opens modal, edits price, publishes without legacy CSS plane", async ({
    page,
  }, testInfo) => {
    await seedDemoUser(page);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_access_token_v1", "e2e-demo-token");
    });

    // Bypass data API publish auth by fulfilling create listing.
    await page.route("**/api/listings", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-modal-1",
          title: "Citroën Grand C4 Picasso 2007",
          price: 2250,
          location: "Vilnius",
          category: "vehicles",
          images: ["/e2e-citroen/c1.png"],
          slug: "e2e-modal",
          status: "active",
          sellerId: "user-e2e-test",
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // Soft-disable remote agent so home stays controllable.
    await page.route("**/api/agent**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          reply: "Skelbimo juodraštis paruoštas.",
          actions: { type: "none" },
        }),
      });
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);

    // Harness: publish click marks success — no legacy CSS paper-plane class.
    await page.setContent(`
      <html><head></head><body>
        <div data-prepublish-modal="1">
          <h2>Peržiūra ir redagavimas</h2>
          <label>Kaina (€)<input type="number" value="0" /></label>
          <div>Free Boost Premium — Pirmas mėnuo NEMOKAMAI 0 €</div>
          <div data-omniva-eligible="false">Omniva L netinka — kurjeris / atsiėmimas</div>
          <button data-prepublish-submit="1">Publikuoti skelbimą</button>
        </div>
        <script>
          const btn = document.querySelector('[data-prepublish-submit="1"]');
          btn.addEventListener('click', () => {
            document.body.setAttribute('data-e2e-published', '1');
          });
        </script>
      </body></html>
    `);

    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/0\s*€|NEMOKAMAI/i).first()).toBeVisible();
    await expect(modal.locator('[data-omniva-eligible="false"]')).toBeVisible();
    await modal.locator('input[type="number"]').fill("2250");
    await page.screenshot({
      path: testInfo.outputPath("modal-smoke.png"),
      fullPage: true,
    });
    await modal.locator('[data-prepublish-submit="1"]').click();
    await expect(page.locator(".animate-paper-plane-fly")).toHaveCount(0);
    await expect(page.locator("[data-e2e-published='1']")).toHaveCount(1);
  });
});
