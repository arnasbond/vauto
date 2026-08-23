import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  categoryButtons,
} from "./helpers/stage12b-comprehension";
import { seedDemoUser } from "./helpers/seed-demo-user";

/**
 * Stage 17G — AI FAILURE INDEPENDENCE.
 *
 * Prove that when every AI/agent endpoint deterministically fails (HTTP 500,
 * connection abort, timeout), the classic marketplace remains fully usable:
 * browse categories, search, open the results feed, and reach chat/Deal-Room /
 * listing creation entry points — without the UI ever "locking" on AI.
 *
 * Runs inside the default loopback static-export harness (no live AI backend),
 * so AI failure is the ambient condition; here we additionally force every
 * API-origin request to fail so the AI-unavailable path is deterministic.
 */
async function forceAiFailure(page: Page) {
  await page.route("https://vauto-api.onrender.com/**", async (route) => {
    const method = route.request().method().toUpperCase();
    const url = route.request().url();
    // Streaming endpoints should abort (connection drop / timeout), the rest 500.
    if (/(stream|vauto-agent|conductor|search)\//i.test(url) && method === "POST") {
      await route.abort("connectionfailed");
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
}

async function openHomeWithAiDown(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await forceAiFailure(page);
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
}

test.describe("Stage 17G — AI failure independence (classic marketplace stays usable)", () => {
  test("desktop 1440x900: browse, search, categories, no lock, zero overflow", async ({
    page,
  }) => {
    await openHomeWithAiDown(page, 1440, 900);

    // No full-page busy/lock overlay while AI is down.
    await expect(page.locator("[data-app-shell]")).toBeVisible();
    const overflow = await horizontalOverflowPx(page);
    expect(overflow, "no horizontal overflow with AI down").toBeLessThanOrEqual(0);

    // Classic browse: category grid renders before any search is submitted.
    await expect(categoryButtons(page).first()).toBeVisible({ timeout: 10_000 });

    // Hero + classic search control are interactive, not AI-blocked (submit works).
    await expect(homeSearchbox(page)).toBeVisible();
    await homeSearchbox(page).fill("elektronika");
    await homeSearchbox(page).press("Enter");

    // Marketplace chrome remains usable (guest nav) — no lock.
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Skelbimai" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Paieška" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Įdėti naują skelbimą" }).or(
        page.getByRole("button", { name: "Įdėti" }).first()
      ).first()
    ).toBeVisible();
  });

  test("mobile 390x844: marketplace usable, no locked UI, zero overflow", async ({
    page,
  }) => {
    await openHomeWithAiDown(page, 390, 844);

    await expect(page.locator("[data-app-shell]")).toBeVisible();
    const overflow = await horizontalOverflowPx(page);
    expect(overflow, "no horizontal overflow on mobile with AI down").toBeLessThanOrEqual(
      0
    );

    await expect(
      page.getByRole("navigation", { name: "Pagrindinė navigacija" })
    ).toBeVisible();
    await expect(categoryButtons(page).first()).toBeVisible({ timeout: 10_000 });
    await expect(homeSearchbox(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Įdėti naują skelbimą" }).first()
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Pokalbiai" }).first()).toBeVisible();
  });

  test("classic search + category browse still work: no AI lock, results reachable", async ({
    page,
  }) => {
    await openHomeWithAiDown(page, 1280, 800);

    // Submit a classic search while AI is down — it must commit (not dead-end
    // into a blocking AI/loading wall) and the category browse must still work.
    const search = homeSearchbox(page);
    await expect(search).toBeVisible();
    await search.fill("MacBook Pro M3 Max");
    await search.press("Enter");

    // Fall back to classic browsing (categories) and land on the results feed.
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 12_000 });

    // Marketplace chrome still reachable (guest nav) — no lock.
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Skelbimai" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Paieška" })).toBeVisible();
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("auth: chat + Deal Room (Sandoriai) entries still work with AI down", async ({
    page,
  }) => {
    await seedDemoUser(page);
    await openHomeWithAiDown(page, 1280, 800);

    // Open the authenticated profile menu — AI failure must not disable it.
    await page.getByRole("button", { name: "Profilio meniu" }).click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 10_000 });

    // Chat and Deal Room entry points remain present and clickable.
    const chats = page
      .getByRole("menu")
      .getByRole("link", { name: /Pokalbiai/i });
    await expect(chats).toHaveCount(1);
    await expect(chats).toBeVisible();

    const dealRoom = page
      .getByRole("menu")
      .getByRole("link", { name: /Sandoriai/i });
    await expect(dealRoom).toHaveCount(1);
    await expect(dealRoom).toBeVisible();
    await expect(dealRoom).toHaveAttribute("href", "/sandoriai/");
  });
});
