import { test, expect, type Page } from "@playwright/test";
import { seedAdminUser, seedDemoUser, seedProUser } from "./helpers/seed-demo-user";
import { listingResults } from "./helpers/listing-results";
import {
  expectCleanSupervisorSearch,
  expectMarketplaceResultSummary,
  installSupervisorSearchMocks,
  supervisorSearchQuery,
} from "./helpers/supervisor-search";

async function waitForHomeReady(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/VAUTO/i);
  await expect(page.getByRole("searchbox").first()).toBeVisible({ timeout: 15_000 });
}

test.describe("VAUTO smoke", () => {
  // Smoke suite asserts the mobile chrome (bottom nav, in-grid filter bar,
  // view toggles) which the adaptive layout renders below the md breakpoint.
  // Pin a phone viewport so these run against the primary mobile UX.
  test.use({ viewport: { width: 412, height: 915 } });

  test("home page loads with listings", async ({ page }) => {
    await waitForHomeReady(page);
    await expect(
      page.getByRole("heading", { name: /Nauja karta skelbimų/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Naujausi skelbimai/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/AI paieška — rašykite laisvai/i)
    ).toHaveCount(0);
  });

  test("profile gate shows login CTA for guests", async ({ page }) => {
    await page.goto("/profile/");
    await expect(page.getByText(/Prisijungti/i).first()).toBeVisible();
  });

  test("chats gate shows login CTA for guests", async ({ page }) => {
    await page.goto("/chats/");
    await expect(page.getByRole("heading", { name: "Pokalbiai" })).toBeVisible();
    await expect(page.getByText(/Prisijungti/i).first()).toBeVisible();
  });

  test("listing detail page renders", async ({ page }) => {
    await page.goto("/listing/bmw-320d-2003-kaunas/");
    await expect(page.locator("body")).toContainText(/BMW|320d/i);
  });

  test("install page accessible", async ({ page }) => {
    await page.goto("/install/");
    await expect(page.getByText(/įdiegti|Įdiegti/i).first()).toBeVisible();
  });

  test("add listing page shows guest gate for visitors", async ({ page }) => {
    await page.goto("/add/");
    await expect(
      page.getByText(/Prisijunkite|Prisijungti prie VAUTO/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("add page shows category chips for signed-in user", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/add/");
    await expect(
      page.getByRole("button", { name: "Auto", exact: true })
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Technika" })).toBeVisible();
    await expect(page.getByText(/Skelbti su Vision AI/i).first()).toBeVisible();
  });

  test("add listing page loads upload UI", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/add/");
    await expect(page.getByText(/Skelbti su Vision AI/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("home search accepts input", async ({ page }) => {
    await waitForHomeReady(page);
    const search = page.getByRole("searchbox").first();
    await search.click();
    await search.fill("bmw");
    await expect(search).toHaveValue("bmw", { timeout: 10_000 });
  });

  test("volvo v70 search shows marketplace results", async ({ page }) => {
    test.setTimeout(90_000);
    await installSupervisorSearchMocks(page, "volvo");
    await waitForHomeReady(page);
    const search = page.getByRole("searchbox").first();
    await search.fill(supervisorSearchQuery("volvo"));
    await search.press("Enter");
    await expectCleanSupervisorSearch(page);
    const results = listingResults(page);
    await expectMarketplaceResultSummary(page);
    await expect(results.locator("article").first()).toBeVisible({ timeout: 20_000 });
  });

  test("marketplace view mode toggles list grid map", async ({ page }) => {
    await waitForHomeReady(page);
    const results = listingResults(page);
    const search = page.getByRole("searchbox").first();
    await search.fill("bmw");
    await search.press("Enter");
    await expect(results.getByRole("button", { name: "Sąrašas" })).toBeVisible({
      timeout: 10_000,
    });
    await results.getByRole("button", { name: "Žemėlapis" }).click();
    await expect(results.getByText(/skelbimų žemėlapyje/i)).toBeVisible({
      timeout: 15_000,
    });
    await results.getByRole("button", { name: "Sąrašas" }).click();
    await expect(results.locator("article").first()).toBeVisible({ timeout: 15_000 });
    await results.getByRole("button", { name: "Tinklelis" }).click();
    await expect(results.locator(".grid").first()).toBeVisible();
  });

  test("marketplace filter bar shows result count", async ({ page }) => {
    await waitForHomeReady(page);
    const results = listingResults(page);
    await expect(results.getByText(/Skelbimai Lietuvoje:.*rezultat/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(results.getByText(/Patikslinkite žemiau per AI asistentą/i)).toBeVisible();
  });

  test("bottom navigation visible on home", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Pagrindinė navigacija" })
    ).toBeVisible();
  });

  test("profile settings shows connection status for signed-in user", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/profile/settings/");
    await expect(page.getByTestId("connection-status")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Demo režimas|Live API/i)).toBeVisible();
  });

  test("runtime config is served", async ({ request }) => {
    const res = await request.get("/runtime-config.json");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.apiUrl).toBeTruthy();
    if (process.env.CI) {
      expect(json.conductorEnabled).toBe(true);
    }
  });

  test("profile shows pro business dashboard for pro user", async ({ page }) => {
    await seedProUser(page);
    await page.goto("/profile/");
    await expect(page.getByText(/Mano VAUTO Pro/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/E2E Autocentras/i)).toBeVisible();
    await expect(page.getByText(/VAUTO Pro balansas/i)).toBeVisible();
    await page.getByRole("button", { name: "Kainodara" }).click();
    await expect(page.getByText(/PPC \+ planai/i)).toBeVisible();
  });

  test("discover page loads", async ({ page }) => {
    await page.goto("/discover/");
    await expect(page.locator("body")).toContainText(/atrask|iešk|skelbim/i);
  });

  test("profile shows admin listing moderation for admin user", async ({ page }) => {
    await seedAdminUser(page);
    await page.goto("/profile/");
    await expect(page.getByRole("heading", { name: "Administratorius" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Skelbimai" }).click();
    await expect(
      page.getByPlaceholder(/Ieškoti pagal pavadinimą, miestą, pardavėją/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Peržiūra/i })).toBeVisible();
  });

  test("home AI assistant strip is visible", async ({ page }) => {
    test.setTimeout(90_000);
    await installSupervisorSearchMocks(page, "bmw");
    await waitForHomeReady(page);
    const search = page.getByRole("searchbox").first();
    await search.fill(supervisorSearchQuery("bmw"));
    await search.press("Enter");
    await expect(page.getByText(/VAUTO asistentas/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("mobile bottom nav shows place ad and profile", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("searchbox").first()).toBeVisible({ timeout: 15_000 });
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav.getByRole("button", { name: "Įdėti naują skelbimą" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Profilis|VAUTO CC/i })).toBeVisible();
    await nav.getByRole("link", { name: /Profilis|VAUTO CC/i }).click();
    await expect(page).toHaveURL(/\/profile\/?/, { timeout: 15_000 });
  });

  test("search submit on home runs state-driven search", async ({ page }) => {
    test.setTimeout(90_000);
    await installSupervisorSearchMocks(page, "bmw");
    await waitForHomeReady(page);
    const search = page.getByRole("searchbox").first();
    await search.fill(supervisorSearchQuery("bmw"));
    await search.press("Enter");
    await expectCleanSupervisorSearch(page);
    await expectMarketplaceResultSummary(page);
    const results = listingResults(page);
    await expect(results.locator("article").first()).toBeVisible({ timeout: 20_000 });
  });

  test("voice-style view mode switches to map", async ({ page }) => {
    await waitForHomeReady(page);
    const results = listingResults(page);
    const search = page.getByRole("searchbox").first();
    await search.fill("bmw");
    await search.press("Enter");
    await expect(results.getByRole("button", { name: "Žemėlapis" })).toBeVisible({
      timeout: 10_000,
    });
    await results.getByRole("button", { name: "Žemėlapis" }).click();
    await expect(results.getByRole("button", { name: "Žemėlapis" })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 10_000 }
    );
  });
});
