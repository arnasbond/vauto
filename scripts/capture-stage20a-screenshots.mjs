import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* Stage 20A.2 evidence screenshots: MASTER visual alignment closure.
 * Light + Dark × (homepage product surface, ui-kit) × (mobile 390, desktop 1440).
 *
 * Theme activation contract (Stage 17): the app reads a PLAIN STRING under
 * `vauto_app_theme_v1` (src/lib/storage.ts loadAppTheme -> localStorage key
 * `vauto_app_theme_v1`) and applies `data-app-theme` on <html>.
 * The capture MUST write exactly that key+format, otherwise every "dark"
 * screenshot silently falls back to light. */
const OUT = join("stage20a", "screenshots");
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";
const THEME_KEY = "vauto_app_theme_v1";

const THEMES = ["light", "dark"];
const SCREENS = [
  { name: "home", path: "/", label: "Stage 20A product surface (homepage)" },
  { name: "ui-kit", path: "/ui-kit/", label: "Design System / UI Kit" },
];
const BREAKPOINTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const shots = [];
const probeLog = [];

for (const theme of THEMES) {
  for (const bp of BREAKPOINTS) {
    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: { width: bp.width, height: bp.height },
        isMobile: bp.name === "mobile",
        hasTouch: bp.name === "mobile",
      });
      const page = await context.newPage();
      await page.addInitScript(
        ([k, t]) => {
          try {
            localStorage.setItem(k, t);
          } catch {}
        },
        [THEME_KEY, theme]
      );
      await page.goto(BASE + screen.path, { waitUntil: "domcontentloaded" }).catch(() => {});
      // Deterministic hydration: wait until the app applied the requested theme.
      await page
        .waitForFunction(
          (t) => document.documentElement.getAttribute("data-app-theme") === t,
          theme,
          { timeout: 10_000 }
        )
        .catch(() => {});
      await page.waitForTimeout(1200);
      const accept = page.getByRole("button", { name: "Sutinku" });
      if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) {
        await accept.click();
        await page.waitForTimeout(500);
      }
      const file = join(OUT, `${theme}-${bp.name}-${screen.name}.png`);
      await page.screenshot({ path: file, fullPage: false }).catch(() => {});
      const state = await page
        .evaluate(() => {
          const px = (el) => (el ? getComputedStyle(el).getPropertyValue(el.dataset.prop || "") : "");
          return {
            dataAppTheme: document.documentElement.getAttribute("data-app-theme"),
            bodyBg: getComputedStyle(document.body).backgroundColor,
            hasDesktopPortal: !!document.querySelector(".vauto-desktop-portal"),
            // Horizontal overflow (unintended scroll) at the target viewport.
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            // Primary + AI CTA evidence on the page.
            primaryCtaBg: (() => {
              const el = document.querySelector('button[data-variant="primary"], .ds-btn-primary');
              return el ? getComputedStyle(el).backgroundColor : null;
            })(),
            aiCtaBg: (() => {
              const el = document.querySelector('button[data-variant="ai"], .ds-btn-ai');
              return el ? getComputedStyle(el).backgroundColor : null;
            })(),
            heading1FontSize: (() => {
              const el = document.querySelector("h1");
              return el ? getComputedStyle(el).fontSize : null;
            })(),
          };
        })
        .catch(() => null);
      probeLog.push({ theme, bp: bp.name, screen: screen.name, file, ...state });

      // Focus-visible evidence: tab to the primary CTA and capture the ring.
      if (screen.name === "ui-kit" && bp.name === "desktop") {
        const focusFile = join(OUT, `${theme}-${bp.name}-ui-kit-focus.png`);
        await page.keyboard.press("Tab").catch(() => {});
        await page.waitForTimeout(300);
        await page.screenshot({ path: focusFile, fullPage: false }).catch(() => {});
        const focusState = await page
          .evaluate(() => ({
            activeTag: document.activeElement?.tagName ?? null,
            activeText: document.activeElement?.textContent?.slice(0, 60) ?? null,
            activeOutline: document.activeElement
              ? getComputedStyle(document.activeElement).outlineStyle
              : null,
          }))
          .catch(() => null);
        probeLog.push({
          theme,
          bp: bp.name,
          screen: screen.name,
          file: focusFile,
          focusEvidence: focusState,
        });
        shots.push(focusFile);
      }
      await context.close();
      shots.push(file);
    }
  }
}

console.log("Captured screenshots:");
for (const s of shots) console.log("  " + s);
console.log("\nProbe state (objective evidence):");
for (const p of probeLog)
  console.log(JSON.stringify(p));

writeFileSync(
  join(OUT, "probe-state.json"),
  JSON.stringify(probeLog, null, 2),
  "utf-8"
);
console.log("\nprobe-state.json written to", join(OUT, "probe-state.json"));
await browser.close();
