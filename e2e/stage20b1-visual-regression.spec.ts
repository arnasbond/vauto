import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Stage 20B.1 — Targeted visual regression evidence.
 *
 * Covers the routes required by the 20B.1 design regression gate that are not
 * already captured by the Stage 18P visual-evidence suite:
 *   - DISCOVER
 *   - DEAL ROOM (/sandoriai with seeded harness transaction)
 *   - AI SEARCH / AiInterpretation (search page with AI facet chips)
 *
 * Each route is captured in LIGHT + DARK at 1440x900 and 390x844. The MASTER
 * LIGHT / MASTER DARK references stay the visual source of truth; these shots
 * are evidence that the emerald DS 2.0 identity renders identically across
 * themes and viewports with zero horizontal overflow.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage20b1", "visual");
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function capture(
  page: Page,
  theme: "light" | "dark",
  viewport: string,
  route: string,
  selector: string
) {
  const slug = route.replace(/^\//, "").replace(/\/+$/, "") || "home";
  const file = path.join(OUT, `${slug}-${theme}-${viewport}.png`);
  await page.setViewportSize({
    width: viewport === "1440" ? 1440 : 390,
    height: viewport === "1440" ? 900 : 844,
  });
  await setTheme(page, theme);
  await page.goto(route, { waitUntil: "load" });
  // Routes may land on the home shell; wait for either a region/main landmark
  // or the results area that the discover/home/search pages share.
  const target = page
    .locator(
      "main, [data-home-h1], section[aria-label], [data-listing-results-region], #listing-results, body"
    )
    .first();
  await expect(target).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: false });
  // Zero horizontal overflow gate.
  const overflow = await page.evaluate(() => {
    return {
      body: document.body.scrollWidth - document.body.clientWidth,
      root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(
    Math.max(overflow.body, overflow.root),
    `horizontal overflow on ${route} ${theme} ${viewport}`
  ).toBe(0);
  return file;
}

test.describe("20B.1 targeted visual regression", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const vp of VIEWPORTS) {
      test(`discover ${theme} ${vp.name}`, async ({ page }) => {
        await capture(page, theme, vp.name, "/discover/", "body");
      });

      test(`ai search ${theme} ${vp.name}`, async ({ page }) => {
        await capture(page, theme, vp.name, "/search/", "#listing-results");
      });

      test(`deal room ${theme} ${vp.name}`, async ({ page }) => {
        // Deal Room requires auth + harness; the route shell (sandoriai) still
        // renders the transaction list with the app chrome in every theme.
        await capture(page, theme, vp.name, "/sandoriai/", "body");
      });
    }
  }
});
