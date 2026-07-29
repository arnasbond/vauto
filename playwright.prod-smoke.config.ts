import { defineConfig, devices } from "@playwright/test";

/** Production smoke — no local webServer. Hard 2-min suite budget via test timeouts. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-404-mask\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL?.trim() || "https://www.vauto.lt",
    trace: "off",
    screenshot: "off",
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
