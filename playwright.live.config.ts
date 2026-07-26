import { defineConfig, devices } from "@playwright/test";

const liveBaseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000";

/**
 * Live Next.js E2E (no static serve).
 * Auto-starts `npm run dev` when nothing is listening; reuses an already-running
 * server (including when release:hero sets CI=true).
 * Override with PLAYWRIGHT_BASE_URL if needed.
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
    baseURL: liveBaseURL,
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
    launchOptions: {
      // Visible headed runs: PLAYWRIGHT_VISUAL=1 slows actions for observation.
      slowMo: process.env.PLAYWRIGHT_VISUAL === "1" ? 200 : 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
        headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: liveBaseURL,
    // release:hero sets CI=true for Chromium channel — still reuse a local :3000.
    reuseExistingServer: process.env.PLAYWRIGHT_FORCE_WEB_SERVER !== "1",
    timeout: 300_000,
  },
});
