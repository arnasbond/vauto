import { defineConfig, devices } from "@playwright/test";

/**
 * Live Next.js E2E (no static serve). Start `npm run dev` first.
 * PLAYWRIGHT_BASE_URL defaults to http://127.0.0.1:3000
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /prepublish-(live|modal-smoke)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-live" }]],
  timeout: 420_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
  ],
});
