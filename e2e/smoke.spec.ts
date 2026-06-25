import { test, expect } from "@playwright/test";
import { seedAdminUser, seedDemoUser, seedProUser } from "./helpers/seed-demo-user";

test.describe("Vauto smoke", () => {
  test("home page loads with listings", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Vauto/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
      page.getByText(/Prisijunkite|Prisijungti prie Vauto/i).first()
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
    await expect(page.getByText(/Skelbti su AI/i).first()).toBeVisible();
  });

  test("add listing page loads upload UI", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/add/");
    await expect(page.getByText(/Skelbti su AI/i).first()).toBeVisible();
  });

  test("home search accepts input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const search = page.getByRole("searchbox").first();
    await search.click();
    await search.fill("bmw");
    await expect(search).toHaveValue("bmw", { timeout: 10_000 });
  });

  test("volvo v70 search shows marketplace results", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const search = page.getByRole("searchbox").first();
    await search.fill("ieskau volvo v70");
    await search.press("Enter");
    const results = page.getByRole("region", { name: "Paieškos rezultatai" });
    await expect(results).toBeVisible({ timeout: 10_000 });
    await expect(results.getByText(/volvo v70.*rezultat/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(results.getByText(/0 rezultat/i)).not.toBeVisible();
  });

  test("marketplace view mode toggles list grid map", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const results = page.getByRole("region", { name: "Paieškos rezultatai" });
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
    await expect(results.locator("article").first()).toBeVisible();
    await results.getByRole("button", { name: "Tinklelis" }).click();
    await expect(results.locator(".grid").first()).toBeVisible();
  });

  test("marketplace sticky filter bar shows category dropdown", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const results = page.getByRole("region", { name: "Paieškos rezultatai" });
    await results.getByRole("button", { name: /Kategorija/i }).click();
    await expect(
      results.getByRole("button", { name: "Auto", exact: true })
    ).toBeVisible();
  });

  test("bottom navigation visible on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("profile shows connection status card", async ({ page }) => {
    await page.goto("/profile/");
    await expect(page.getByTestId("connection-status")).toBeVisible();
    await expect(page.getByText(/Demo režimas|Live API/i)).toBeVisible();
  });

  test("runtime config is served", async ({ request }) => {
    const res = await request.get("/runtime-config.json");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.apiUrl).toBeTruthy();
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
    await expect(page.getByRole("button", { name: /Visi/i })).toBeVisible();
  });

  test("AI agent opens from FAB on profile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile/");
    await page.waitForLoadState("networkidle");
    const fab = page.getByTestId("vauto-agent-fab");
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();
    await expect(page.getByRole("dialog", { name: "VAUTO AI asistentas" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Sveiki! Aš esu VAUTO asistentas/i)).toBeVisible();
  });

  test("mobile bottom nav shows place ad and profile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav.getByRole("button", { name: "Įdėti naują skelbimą" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Profilis|VAUTO CC/i })).toBeVisible();
    await nav.getByRole("link", { name: /Profilis|VAUTO CC/i }).click();
    await expect(page).toHaveURL(/\/profile\/?/, { timeout: 15_000 });
    await expect(page.getByTestId("connection-status")).toBeVisible();
  });

  test("Gemini send on home runs state-driven search", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const search = page.getByRole("searchbox").first();
    await search.fill("bmw kaunas");
    await page.getByRole("button", { name: "Siųsti Gemini asistentui" }).click();
    const results = page.getByRole("region", { name: "Paieškos rezultatai" });
    await expect(results.getByText(/bmw kaunas.*rezultat/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
