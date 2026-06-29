import { logProductionWarn } from "../lib/production-log.js";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 VautoPortalSync/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "lt,en;q=0.9",
};

type PlaywrightBrowser = import("playwright").Browser;

let sharedBrowser: PlaywrightBrowser | null = null;
let browserInitFailed = false;

function scraperDisabled(): boolean {
  return process.env.PORTAL_SCRAPER_DISABLED?.trim() === "1";
}

async function getSharedBrowser(): Promise<PlaywrightBrowser | null> {
  if (scraperDisabled() || browserInitFailed) return null;
  if (sharedBrowser) return sharedBrowser;

  try {
    const { chromium } = await import("playwright");
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    return sharedBrowser;
  } catch (err) {
    browserInitFailed = true;
    logProductionWarn("portal-scraper", "Playwright unavailable — using fetch fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchWithPlaywright(url: string): Promise<string | null> {
  const browser = await getSharedBrowser();
  if (!browser) return null;

  let page: import("playwright").Page | null = null;
  try {
    page = await browser.newPage({
      userAgent: FETCH_HEADERS["User-Agent"],
      locale: "lt-LT",
    });
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    await page.waitForTimeout(1800);
    const html = await page.content();
    return html.length > 400 ? html : null;
  } catch (err) {
    logProductionWarn("portal-scraper", "Playwright page fetch failed", {
      url: url.slice(0, 120),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await page?.close().catch(() => undefined);
  }
}

async function fetchWithHttp(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  return res.text();
}

/** Unified HTML fetch — Playwright/Chromium first, plain fetch fallback. */
export async function fetchPortalProfileHtml(url: string): Promise<string> {
  const playwrightHtml = await fetchWithPlaywright(url);
  if (playwrightHtml) return playwrightHtml;
  return fetchWithHttp(url);
}

export async function closePortalScraperBrowser(): Promise<void> {
  if (!sharedBrowser) return;
  await sharedBrowser.close().catch(() => undefined);
  sharedBrowser = null;
}

process.on("SIGTERM", () => {
  void closePortalScraperBrowser();
});
process.on("SIGINT", () => {
  void closePortalScraperBrowser();
});
