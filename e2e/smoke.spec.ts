import { test, expect } from "@playwright/test";
import { seedDemoUser, seedProUser } from "./helpers/seed-demo-user";

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
    await page.goto("/listing/dviratis-trek-panevezys/");
    await expect(page.locator("body")).toContainText(/dviratis|Dviratis/i);
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
    await expect(page.getByRole("button", { name: "Auto" })).toBeVisible({
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
    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/ieškoti|paieška/i));
    await search.first().fill("dviratis");
    await expect(search.first()).toHaveValue("dviratis");
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
});
