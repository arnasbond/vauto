import { test, expect, type Page } from "@playwright/test";
import { seedAdminUser, seedDemoUser } from "./helpers/seed-demo-user";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function dismissGdpr(page: Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function shot(page: Page, file: string) {
  await page.screenshot({
    path: `docs/ui-nav-2.0/${file}`,
    fullPage: false,
  });
}

test.describe("App Shell 2.0 navigation", () => {
  for (const vp of VIEWPORTS) {
    test(`guest chrome @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await dismissGdpr(page);
      await expect(page.locator("[data-app-header]")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("[data-app-shell]")).toHaveAttribute(
        "data-persona",
        "guest"
      );
      await expect(page.locator("[data-app-shell]")).toHaveAttribute(
        "data-zone",
        "marketplace"
      );

      if (vp.width < 768) {
        const nav = page.getByRole("navigation", {
          name: "Pagrindinė navigacija",
        });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link", { name: "Pradžia" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Paieška" })).toBeVisible();
        await expect(
          nav.getByRole("button", { name: "Įdėti naują skelbimą" })
        ).toBeVisible();
        await expect(nav.getByRole("link", { name: "Pokalbiai" })).toBeVisible();
        await expect(nav.getByRole("link", { name: /Profilis/i })).toBeVisible();
      } else {
        await expect(
          page.getByRole("navigation", { name: "Pagrindinė navigacija" })
        ).toBeVisible();
        await expect(page.getByRole("link", { name: "Skelbimai" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Paieška" })).toBeVisible();
      }

      await shot(page, `guest-${vp.name}.png`);
    });

    test(`buyer chrome @ ${vp.name}`, async ({ page }) => {
      await seedDemoUser(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await dismissGdpr(page);
      await expect(page.locator("[data-app-header]")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("[data-app-shell]")).toHaveAttribute(
        "data-persona",
        "buyer"
      );

      if (vp.width >= 768) {
        await expect(
          page.getByRole("link", { name: "Mano skelbimai" })
        ).toBeVisible();
      } else {
        await expect(
          page
            .getByRole("navigation", { name: "Pagrindinė navigacija" })
            .getByRole("link", { name: /Profilis/i })
        ).toBeVisible();
      }

      await shot(page, `buyer-${vp.name}.png`);
    });

    test(`admin control-center chrome @ ${vp.name}`, async ({ page }) => {
      await seedAdminUser(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/profile/?tab=moderation");
      await dismissGdpr(page);
      await expect(page.locator("[data-app-shell]")).toHaveAttribute(
        "data-zone",
        "control-center",
        { timeout: 15_000 }
      );
      await expect(page.locator("[data-app-header]")).toBeVisible();

      if (vp.width >= 768) {
        await expect(page.locator("[data-app-sidebar]")).toBeVisible();
        await expect(
          page.getByRole("navigation", { name: "Control Center" })
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Pranešimai" }).first()
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Moderacija" }).first()
        ).toBeVisible();
      } else {
        await page.getByRole("button", { name: "Atidaryti meniu" }).click();
        await expect(
          page.getByRole("dialog", { name: "Control Center" })
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Pranešimai" }).first()
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("dialog", { name: "Control Center" })
        ).toHaveCount(0);
      }

      await shot(page, `admin-cc-${vp.name}.png`);
    });
  }

  test("keyboard: profile menu Escape closes", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await dismissGdpr(page);
    await page.getByRole("button", { name: "Profilio meniu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});
