import { test, expect } from "@playwright/test";
import {
  VEHICLE_ATTR_RE,
  dismissGdpr,
} from "./helpers/stage12b-comprehension";

test.describe("Stage 13A.1 — /add schema URL restore", () => {
  test("electronics query restores schema without vehicle fields", async ({
    page,
  }) => {
    await page.goto("/add/?vertical=electronics");
    await dismissGdpr(page);
    const funnel = page.locator("[data-seller-funnel]");
    await expect(funnel).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-category-schema]")).toHaveAttribute(
      "data-category-schema",
      "ELECTRONICS"
    );
    await expect(funnel).not.toContainText(VEHICLE_ATTR_RE);
    await expect(page.locator("[data-selected-vertical]")).toContainText(
      /Elektronika/
    );
  });

  test("jobs query restores JOBS schema without platform payment", async ({
    page,
  }) => {
    await page.goto("/add/?vertical=jobs");
    await dismissGdpr(page);
    const funnel = page.locator("[data-seller-funnel]");
    await expect(funnel).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-category-schema]")).toHaveAttribute(
      "data-category-schema",
      "JOBS"
    );
    await expect(page.locator("[data-no-platform-payment]")).toBeVisible();
    await expect(funnel).toContainText(/platformos mokėjimas netaikomas/);
    await expect(funnel).not.toContainText(VEHICLE_ATTR_RE);
  });
});
