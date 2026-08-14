import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join("docs", "ui-home-3.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

test.describe("Homepage Premium UI 3.0 snapshots", () => {
  test("desktop 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await dismissGdpr(page);
    await expect(
      page.getByRole("heading", { name: /Žmogus sprendžia/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("searchbox").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Kaip tai veikia/i })
    ).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "home-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await dismissGdpr(page);
    await expect(
      page.getByRole("heading", { name: /Žmogus sprendžia/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("navigation", { name: "Pagrindinė navigacija" })
    ).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "home-mobile.png"),
      fullPage: false,
    });
  });
});
