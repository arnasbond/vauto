import { defineConfig, devices } from "@playwright/test";

/**
 * Default Playwright suite (localhost LOCKOUT):
 * - e2e/              legacy smoke + conductor
 * - tests/e2e/        enterprise business-flow pack (CI gate)
 *
 * HARD RULE: this config may ONLY hit loopback (127.0.0.1 / localhost).
 * PLAYWRIGHT_BASE_URL pointing at www.vauto.lt (or any remote host) throws at load time.
 * Intentional live/prod suites use separate configs:
 *   playwright.live.config.ts | playwright.prod-real.config.ts | playwright.prod-smoke.config.ts
 */
function assertLocalhostOnlyBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`[playwright.config] Invalid PLAYWRIGHT_BASE_URL: ${raw}`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!isLoopback) {
    throw new Error(
      `[playwright.config] LOCKOUT: default E2E may only target localhost/127.0.0.1 (got ${raw}). ` +
        `Do not point PLAYWRIGHT_BASE_URL at production. Use playwright.prod-real.config.ts for live runs.`
    );
  }

  if (/vauto\.lt/i.test(raw) || /onrender\.com/i.test(raw)) {
    throw new Error(
      `[playwright.config] LOCKOUT: refusing production/remote host in default suite (${raw}).`
    );
  }

  if (process.env.PLAYWRIGHT_AGAINST_PROD === "1") {
    throw new Error(
      `[playwright.config] LOCKOUT: PLAYWRIGHT_AGAINST_PROD=1 is disabled for the default suite. ` +
        `Use playwright.prod-real.config.ts instead.`
    );
  }

  return raw;
}

const configuredBase = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = assertLocalhostOnlyBaseUrl(
  configuredBase && configuredBase.length > 0
    ? configuredBase
    : "http://127.0.0.1:4173"
);

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
      testIgnore: [/prepublish-live\.spec\.ts$/, /prod-real-journey\.spec\.ts$/],
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
    {
      name: "e2e-webkit",
      testDir: "./e2e",
      testMatch: /stage22a[12]-webkit.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        browserName: "webkit",
        channel: undefined,
        viewport: { width: 390, height: 844 },
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
    // Prefer local binary if present; --yes avoids interactive npx prompts on cold cache.
    command: "node scripts/build-e2e-static.mjs && npx --yes serve@14.2.6 out -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    // Next export + cold `serve` install can exceed 3 minutes on Windows.
    timeout: 420_000,
  },
});
