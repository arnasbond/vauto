import { test, expect } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  openHome,
} from "./helpers/stage12b-comprehension";

async function expectNoVehicleOnlyFacets(
  page: import("@playwright/test").Page,
  panel: string
) {
  await expect(page.locator(`${panel} [data-facet-key="mileage"]`)).toHaveCount(0);
  await expect(page.locator(`${panel} [data-facet-key="vin"]`)).toHaveCount(0);
  await expect(page.locator(`${panel} [data-facet-key="fuelType"]`)).toHaveCount(0);
}

test.describe("Stage 13B — Dynamic Faceted Search & Filters", () => {
  test("A — dynamic filter generation from 13A registry (desktop)", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 });
    const vertical = page.locator("#desktop-facet-vertical");
    await expect(vertical).toBeVisible();

    await vertical.selectOption("REAL_ESTATE");
    const panel = page.locator("[data-facet-panel][data-facet-vertical='REAL_ESTATE']");
    await expect(panel.locator("[data-facet-key='rooms']")).toHaveCount(1);
    await expect(panel.locator("[data-facet-key='area']")).toHaveCount(1);
    await expectNoVehicleOnlyFacets(page, "[data-facet-desktop]");
    await expect(panel.locator("[data-facet-key='jobTitle']")).toHaveCount(0);
    await expect(panel.locator("[data-facet-key='salaryMin']")).toHaveCount(0);

    await vertical.selectOption("ELECTRONICS");
    const el = page.locator("[data-facet-panel][data-facet-vertical='ELECTRONICS']");
    await expect(el.locator("[data-facet-key='condition']")).toBeVisible();
    await expect(el.locator("[data-facet-key='rooms']")).toHaveCount(0);
    await expect(el.locator("[data-facet-key='salaryMin']")).toHaveCount(0);

    await vertical.selectOption("JOBS");
    const jobs = page.locator("[data-facet-panel][data-facet-vertical='JOBS']");
    await expect(jobs.locator("[data-facet-key='jobTitle']")).toBeVisible();
    await expect(jobs.locator("[data-facet-key='mileage']")).toHaveCount(0);
    await expect(jobs.locator("[data-facet-key='vin']")).toHaveCount(0);
  });

  test("B — URL two-way synchronization", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("#desktop-facet-vertical").selectOption("ELECTRONICS");
    await page.locator("#desktop-facet-condition").selectOption("Naudotas");
    await expect(page).toHaveURL(/vertical=electronics/);
    await expect(page).toHaveURL(/condition=Naudotas/);

    await page.reload();
    await dismissGdpr(page);
    await expect(page.locator("#desktop-facet-vertical")).toHaveValue("ELECTRONICS");
    await expect(page.locator("#desktop-facet-condition")).toHaveValue("Naudotas");
  });

  test("C — incompatible facets stripped TRANSPORT → JOBS", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("#desktop-facet-vertical").selectOption("TRANSPORT");
    await page.locator("#desktop-facet-mileage-max").fill("100000");
    await expect(page).toHaveURL(/mileage_max=100000/);

    await page.locator("#desktop-facet-vertical").selectOption("JOBS");
    await expect(page).not.toHaveURL(/mileage/);
    await expect(page).not.toHaveURL(/fuelType/);
    await expect(page).toHaveURL(/vertical=jobs/);
    await expect(
      page.locator("[data-facet-panel][data-facet-vertical='JOBS'] [data-facet-key='mileage']")
    ).toHaveCount(0);
  });

  test("D — mobile drawer open / select / apply / close, no overflow", async ({
    page,
  }) => {
    await openHome(page, { width: 375, height: 812 });
    await page.locator("#listing-results").scrollIntoViewIfNeeded();
    const trigger = page.locator("[data-facet-drawer-trigger]");
    await expect(trigger).toBeVisible();
    await trigger.click();
    const drawer = page.locator("[data-facet-drawer]");
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Filtrai" })).toBeVisible();

    await page.locator("#drawer-facet-vertical").selectOption("ELECTRONICS");
    await page.locator("#drawer-facet-condition").selectOption("Naudotas");
    await page.locator("[data-facet-apply]").click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/vertical=electronics/);
    await expect(page).toHaveURL(/condition=Naudotas/);

    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("J — deep-link hydration is deterministic after reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?vertical=electronics&condition=Naudotas");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#desktop-facet-vertical")).toHaveValue("ELECTRONICS");
    await expect(page.locator("#desktop-facet-condition")).toHaveValue("Naudotas");

    await page.reload();
    await dismissGdpr(page);
    await expect(page.locator("#desktop-facet-vertical")).toHaveValue("ELECTRONICS");
    await expect(page.locator("#desktop-facet-condition")).toHaveValue("Naudotas");
    await expect(page).toHaveURL(/vertical=electronics/);
    await expect(page).toHaveURL(/condition=Naudotas/);
  });

  test("K — facet change resets page in URL", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?vertical=real_estate&rooms=2&page=4");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
    await page.locator("#desktop-facet-area-min").fill("45");
    await expect(page).not.toHaveURL(/page=4/);
  });

  test("G — hydrated rooms filter stays on NT vertical (result set: unit/HTTP fixtures)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?vertical=real_estate&rooms=2");
    await dismissGdpr(page);
    await expect(page.locator("#desktop-facet-vertical")).toHaveValue("REAL_ESTATE");
    await expect(page.locator("#desktop-facet-rooms-min")).toHaveValue("2");
    await expect(
      page.locator("[data-facet-desktop] [data-facet-key='mileage']")
    ).toHaveCount(0);
  });

  test("M — multi-word location facet keeps the space", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("#desktop-facet-vertical").selectOption("REAL_ESTATE");
    const location = page.locator("#desktop-facet-location");
    await location.click();
    await location.fill("Naujoji Akmenė");
    await expect(location).toHaveValue("Naujoji Akmenė");
  });

  test("N — consecutive typing keeps the space (not fill)", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("#desktop-facet-vertical").selectOption("REAL_ESTATE");
    const location = page.locator("#desktop-facet-location");
    await location.click();
    await page.keyboard.type("Kazlų Rūda", { delay: 25 });
    await expect(location).toHaveValue("Kazlų Rūda");
  });

  test("O — raw input may keep spaces; serialized value is trimmed", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("#desktop-facet-vertical").selectOption("REAL_ESTATE");
    const location = page.locator("#desktop-facet-location");
    await location.click();
    await page.keyboard.type("  Vilnius  ", { delay: 20 });
    await location.blur();
    await expect(page).toHaveURL(/location=Vilnius/);
    await expect(page).not.toHaveURL(/location=%20/);
    await expect(page).not.toHaveURL(/location=\+\+/);
  });

  test("P — invalid vertical is stripped; mileage is not kept", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?vertical=hacked&mileage_max=100");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/hacked/);
    await expect(page).not.toHaveURL(/mileage/);
    await expect(page.locator("#desktop-facet-vertical")).toHaveValue("");
  });
});
