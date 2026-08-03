import { defineConfig, devices } from "@playwright/test";

/**
 * Default Playwright suite:
 * - e2e/              legacy smoke + conductor
 * - tests/e2e/        enterprise business-flow pack (CI gate)
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "on-first-retry",
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
  webServer: {
    command: "node scripts/build-e2e-static.mjs && npx serve out -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
