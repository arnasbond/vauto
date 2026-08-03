import { defineConfig, devices } from "@playwright/test";

/**
 * REAL production/stable E2E — no local webServer, no route mocks.
 * Hits live UI + live API (demo OTP phones only).
 *
 *   npm run test:e2e:prod-real
 *   PLAYWRIGHT_BASE_URL=https://www.vauto.lt npx playwright test --config=playwright.prod-real.config.ts
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "https://www.vauto.lt";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /prod-real-journey\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-prod-real" }],
    ["json", { outputFile: "test-results/prod-real-report.json" }],
  ],
  timeout: 420_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 45_000,
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
        headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
      },
    },
  ],
});
