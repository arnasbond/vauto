import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { dismissGdpr } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A-7 — Responsive / MASTER parity evidence.
 *
 * Captures representative verticals (vehicles, real_estate, electronics,
 * services, jobs, home/garden) across 1920/1440/768/390 in LIGHT and DARK,
 * asserting zero horizontal overflow on every combination.
 *
 * The screenshots are saved under docs/audit/stage22a/visual for the audit
 * package. MASTER LIGHT / MASTER DARK remain the single design system; the
 * shots prove the same VAUTO card contract renders across viewports and themes
 * without external-portal theming.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22a", "visual");
const VIEWPORTS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
] as const;

const VERTICALS = [
  { slug: "vehicles", url: "/search?vertical=transport&q=Volvo" },
  { slug: "real_estate", url: "/search?vertical=real_estate&q=butas" },
  { slug: "electronics", url: "/search?vertical=electronics&q=iPhone" },
  { slug: "services", url: "/search?vertical=services&q=santechnikas" },
  { slug: "jobs", url: "/search?vertical=jobs&q=vairuotojas" },
  { slug: "home", url: "/search?vertical=home&q=sofa" },
] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_app_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function capture(
  page: Page,
  theme: "light" | "dark",
  viewport: string,
  vertical: string,
  url: string
) {
  const file = path.join(OUT, `${vertical}-${theme}-${viewport}.png`);
  const vp = VIEWPORTS.find((v) => v.name === viewport)!;
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await setTheme(page, theme);
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(500);
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
    `horizontal overflow ${vertical} ${theme} ${viewport}`
  ).toBe(0);
}

test.describe("22A-7 responsive / master parity", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const vp of VIEWPORTS) {
      for (const v of VERTICALS) {
        test(`${v.slug} ${theme} ${vp.name}`, async ({ page }) => {
          await capture(page, theme, vp.name, v.slug, v.url);
        });
      }
    }
  }
});
