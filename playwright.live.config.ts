import { defineConfig, devices } from "@playwright/test";

/**
 * Live Next.js E2E (no static serve) — localhost LOCKOUT.
 * Auto-starts `npm run dev` when nothing is listening; reuses an already-running
 * server (including when release:hero sets CI=true).
 *
 * Only loopback hosts are allowed. Production URLs must use playwright.prod-real.config.ts.
 */
function assertLocalhostOnlyBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`[playwright.live.config] Invalid PLAYWRIGHT_BASE_URL: ${raw}`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!isLoopback || /vauto\.lt/i.test(raw)) {
    throw new Error(
      `[playwright.live.config] LOCKOUT: live Vision E2E may only target localhost/127.0.0.1 (got ${raw}).`
    );
  }

  return raw;
}

const liveBaseURL = assertLocalhostOnlyBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000"
);

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
