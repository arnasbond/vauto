import { defineConfig, devices } from "@playwright/test";

/**
 * Default Playwright suite:
 * - e2e/              legacy smoke + conductor
 * - tests/e2e/        enterprise business-flow pack (CI gate)
 *
 * Enterprise/local webServer builds MUST hit 127.0.0.1:4173.
 * A leftover PLAYWRIGHT_BASE_URL=https://www.vauto.lt would otherwise
 * "pass" or fail against PRODUCTION and hide broken EditListingModal builds.
 * Opt into live URL only with PLAYWRIGHT_AGAINST_PROD=1.
 */
const againstProd = process.env.PLAYWRIGHT_AGAINST_PROD === "1";
const configuredBase = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL =
  againstProd && configuredBase
    ? configuredBase
    : "http://127.0.0.1:4173";

export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // SW cache-first on /_next/static can serve a STALE EditListingModal after rebuilds.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "e2e-legacy",
      testDir: "./e2e",
      // Live Vision/OCR seller path requires Next.dev + API — use playwright.live.config.ts.
      testIgnore: [/prepublish-live\.spec\.ts$/],
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
    {
      name: "e2e-enterprise",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
  ],
  webServer: againstProd
    ? undefined
    : {
        command: "node scripts/build-e2e-static.mjs && npx serve out -l 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
