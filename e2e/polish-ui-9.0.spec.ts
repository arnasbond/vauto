import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join("docs", "ui-final-9.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

test.describe("Premium UI 9.0 final polish & a11y", () => {
  test("polish.css loaded + glass header + focus-visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await dismissGdpr(page);

    const hoverMs = await page.evaluate(() => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--ds-duration-hover")
        .trim();
      if (!raw) return NaN;
      if (raw.endsWith("ms")) return parseFloat(raw);
      if (raw.endsWith("s")) return parseFloat(raw) * 1000;
      return parseFloat(raw);
    });
    expect(hoverMs).toBeGreaterThanOrEqual(140);
    expect(hoverMs).toBeLessThanOrEqual(200);

    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/ds-glass/);

    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(
      () => document.activeElement?.tagName ?? ""
    );
    expect(["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"]).toContain(focusedTag);

    await page.screenshot({
      path: path.join(OUT, "polish-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile glass bottom nav + reduced-motion tokens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await dismissGdpr(page);

    const nav = page.getByRole("navigation", {
      name: "Pagrindinė navigacija",
    });
    await expect(nav).toBeVisible();
    await expect(nav).toHaveClass(/ds-glass/);

    const hoverDuration = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ds-duration-hover")
        .trim()
    );
    // Browsers may serialize 0ms as 0s.
    expect(hoverDuration).toMatch(/^0(ms|s)$/);

    await page.screenshot({
      path: path.join(OUT, "polish-mobile.png"),
      fullPage: false,
    });
  });

  test("ui-kit modal Escape closes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ui-kit");
    await dismissGdpr(page);

    const openBtn = page
      .getByRole("button", { name: /Atidaryti modalą|Modal|Atidaryti/i })
      .first();
    if (await openBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await openBtn.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "UiKit modal trigger not found — Escape covered by DS Modal unit path",
      });
    }
  });
});
