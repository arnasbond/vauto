import { test, expect } from "@playwright/test";

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

  test("add listing page loads upload UI", async ({ page }) => {
    await page.goto("/add/");
    await expect(page.getByText(/įkelti|nuotrauk|skelbim/i).first()).toBeVisible();
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

  test("discover page loads", async ({ page }) => {
    await page.goto("/discover/");
    await expect(page.locator("body")).toContainText(/atrask|iešk|skelbim/i);
  });
});
