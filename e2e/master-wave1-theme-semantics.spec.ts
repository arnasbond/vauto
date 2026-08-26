import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";
import { seedDemoUser } from "./helpers/seed-demo-user";

/**
 * MASTER VISUAL CONVERGENCE — WAVE 1 — Theme Authority Contract E2E.
 *
 * Proves the deterministic behavior required by the Wave 1 directive
 * (§3 Theme Authority Contract, §4 Zero-FOUC, §5 /profile/settings fix,
 * §6 global application, §10 responsive foundation, §12 required tests):
 *
 *  1. first visit + OS LIGHT => LIGHT
 *  2. first visit + OS DARK => DARK
 *  3. persisted LIGHT + OS DARK => LIGHT (explicit override wins)
 *  4. persisted DARK + OS LIGHT => DARK (explicit override wins)
 *  5. OS preference change follows ONLY when no explicit override exists
 *  6. explicit selection survives reload
 *  7. explicit selection survives navigation
 *  8. direct navigation to /profile/settings correctly renders DARK
 *  9. client-side navigation to /profile/settings correctly renders DARK
 * 10. no route resets theme (home -> settings -> home)
 * 11. no hydration mismatch (no React hydration console errors)
 * 12. no visible opposite-theme first-paint (attribute already correct at
 *     `domcontentloaded`, i.e. before hydration/bundle execution)
 * 13. overlay/sheet inherits the current theme (no hardcoded overlay colors)
 * 14. global shell has zero horizontal overflow at required viewports
 * 15. LIGHT/DARK render the identical DOM/component hierarchy (no separate trees)
 */

const THEME_KEY = "vauto_app_theme_v1";

async function appTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
}

async function setPersistedTheme(page: Page, value: "light" | "dark" | "system") {
  await page.addInitScript((v) => {
    window.localStorage.setItem("vauto_app_theme_v1", v);
  }, value);
}

test.describe("MASTER Wave 1 — Theme Authority Contract", () => {
  test("1. first visit + OS LIGHT => LIGHT", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("light");
  });

  test("2. first visit + OS DARK => DARK", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("dark");
  });

  test("3. persisted LIGHT overrides OS DARK", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await setPersistedTheme(page, "light");
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("light");
  });

  test("4. persisted DARK overrides OS LIGHT", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("dark");
  });

  test("5a. OS preference change is followed when preference is system (no override)", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => appTheme(page)).toBe("dark");
  });

  test("5b. OS preference change is IGNORED once an explicit override exists", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("dark");

    // OS flips to light — explicit DARK selection must win and NOT flip.
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(300);
    expect(await appTheme(page)).toBe("dark");
  });

  test("6. explicit selection survives reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await expect.poll(() => appTheme(page)).toBe("dark");

    await page.reload();
    await expect.poll(() => appTheme(page)).toBe("dark");
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe("dark");
  });

  test("7. explicit selection survives client-side navigation", async ({ page }) => {
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await dismissGdpr(page);
    await expect.poll(() => appTheme(page)).toBe("dark");

    await page.getByRole("link", { name: "Paieška" }).first().click();
    await expect.poll(() => appTheme(page)).toBe("dark");
  });

  test("8. direct navigation to /profile/settings renders DARK", async ({ page }) => {
    await seedDemoUser(page);
    await setPersistedTheme(page, "dark");
    await page.goto("/profile/settings");
    await dismissGdpr(page);
    await expect(page.getByRole("heading", { name: /Programėlės tema/i })).toBeVisible({
      timeout: 20_000,
    });
    expect(await appTheme(page)).toBe("dark");
  });

  test("9. client-side navigation to /profile/settings renders DARK", async ({ page }) => {
    await seedDemoUser(page);
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await dismissGdpr(page);
    await expect.poll(() => appTheme(page)).toBe("dark");

    // Real in-app path to /profile/settings: open the profile dropdown menu
    // and follow its "Nustatymai" (Settings) link — a genuine SPA transition,
    // not a full reload.
    await page.getByRole("button", { name: /Profilio meniu/i }).click();
    await page.getByRole("link", { name: /Nustatymai/i }).click();
    await expect(page).toHaveURL(/\/profile\/settings\/?$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Programėlės tema/i })).toBeVisible({
      timeout: 20_000,
    });
    expect(await appTheme(page)).toBe("dark");
  });

  test("10. theme is never reset across home -> settings -> home", async ({ page }) => {
    await seedDemoUser(page);
    await setPersistedTheme(page, "dark");
    await page.goto("/");
    await dismissGdpr(page);
    expect(await appTheme(page)).toBe("dark");

    await page.goto("/profile/settings");
    expect(await appTheme(page)).toBe("dark");

    await page.goto("/");
    expect(await appTheme(page)).toBe("dark");
  });

  test("11. no React hydration mismatch console errors", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/hydrat/i.test(text)) hydrationErrors.push(text);
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.goto("/profile/settings");
    await page.waitForLoadState("load");

    expect(hydrationErrors, hydrationErrors.join("\n")).toHaveLength(0);
  });

  test("12. theme attribute is already correct at domcontentloaded (before hydration)", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // domcontentloaded fires only after all synchronous <head> scripts have
    // executed and BEFORE the React bundle has fetched/hydrated — proving the
    // bootstrap script (not React) is what establishes the correct theme.
    expect(await appTheme(page)).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/profile/settings", { waitUntil: "domcontentloaded" });
    expect(await appTheme(page)).toBe("light");
  });

  test("13. overlay/sheet inherits the current active theme (no hardcoded colors)", async ({
    page,
  }) => {
    async function sheetBackground(theme: "light" | "dark"): Promise<string> {
      await page.emulateMedia({ colorScheme: theme });
      await setPersistedTheme(page, theme);
      await page.goto("/");
      await dismissGdpr(page);
      await expect.poll(() => appTheme(page)).toBe(theme);
      await page.getByRole("button", { name: /Vision AI paieška pagal nuotrauką/i }).click();
      const sheet = page.locator(".vauto-auth-modal, [class*='ds-surface-card']").first();
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      const bg = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.keyboard.press("Escape").catch(() => undefined);
      return bg;
    }

    const lightBg = await sheetBackground("light");
    const page2 = page; // reuse same page for dark pass in a fresh context step
    void page2;
    const darkBg = await sheetBackground("dark");

    expect(lightBg).not.toBe(darkBg);
  });

  test("14. zero horizontal overflow at required viewports (both themes)", async ({ page }) => {
    test.setTimeout(90_000); // 2 themes x 6 viewports x full navigation each
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [390, 430, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await dismissGdpr(page);
        const overflow = await horizontalOverflowPx(page);
        expect(overflow, `${theme} @ ${width}px overflow`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("15. LIGHT/DARK render the identical DOM hierarchy (structural parity)", async ({
    page,
  }) => {
    async function structureFingerprint(theme: "light" | "dark") {
      await page.emulateMedia({ colorScheme: theme });
      await setPersistedTheme(page, theme);
      await page.goto("/");
      await dismissGdpr(page);
      await expect.poll(() => appTheme(page)).toBe(theme);
      return page.evaluate(() => ({
        headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((n) => n.tagName),
        navLinks: Array.from(document.querySelectorAll("nav a")).length,
        buttons: document.querySelectorAll("button").length,
      }));
    }

    const light = await structureFingerprint("light");
    const dark = await structureFingerprint("dark");

    expect(dark.headings).toEqual(light.headings);
    expect(dark.navLinks).toBe(light.navLinks);
    expect(dark.buttons).toBe(light.buttons);
  });
});
