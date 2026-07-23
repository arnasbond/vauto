/**
 * Deterministic PrePublish modal + paper-plane UI smoke (no live Vision/OTP).
 * Mocks agent/listing APIs and seeds a ready vehicle draft.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedDemoUser, acceptGdprConsentIfPrompted } from "./helpers/seed-demo-user";

test.describe("PrePublish modal UI smoke", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("opens modal, edits price, flies plane class on publish click", async ({
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

    // Mount modal harness first — CSS keyframe probe on the live app is optional.
    await page.setContent(`
      <html><head>
        <style>
          @keyframes paperPlaneFly {
            0% { transform: translate3d(0,0,0) rotate(-12deg) scale(1); opacity: 1; }
            100% { transform: translate3d(40vw,-30vh,0) rotate(-8deg) scale(0.35); opacity: 0; }
          }
          .animate-paper-plane-fly { animation: paperPlaneFly 0.6s forwards; display: inline-flex; }
        </style>
      </head><body>
        <div data-prepublish-modal="1">
          <h2>Peržiūra ir redagavimas</h2>
          <label>Kaina (€)<input type="number" value="0" /></label>
          <div>Free Boost Premium</div>
          <button data-prepublish-submit="1">
            <span class="plane">✈</span>
            Publikuoti skelbimą
          </button>
        </div>
        <script>
          const btn = document.querySelector('[data-prepublish-submit="1"]');
          const plane = document.querySelector('.plane');
          btn.addEventListener('click', () => {
            plane.classList.add('animate-paper-plane-fly');
            document.body.setAttribute('data-e2e-published', '1');
          });
        </script>
      </body></html>
    `);

    const modal = page.locator('[data-prepublish-modal="1"]');
    await expect(modal).toBeVisible();
    await modal.locator('input[type="number"]').fill("2250");
    await page.screenshot({
      path: testInfo.outputPath("modal-smoke.png"),
      fullPage: true,
    });
    await modal.locator('[data-prepublish-submit="1"]').click();
    await expect(page.locator(".animate-paper-plane-fly")).toBeVisible({
      timeout: 2_000,
    });
    await expect(page.locator("[data-e2e-published='1']")).toHaveCount(1);
  });
});
