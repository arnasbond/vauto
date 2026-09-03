import { test, expect, type Page } from "@playwright/test";
import {
  forceOfflineCatalog,
  seedBuyerSession,
} from "./helpers/seed";

/**
 * F9 — search/sell session isolation & assistant navigation.
 * Deterministic offline fixtures; no production catalog dependency.
 */

const WELCOME_RE =
  /Pasirinkite kategoriją|aprašykite objektą|ką parduodate|skelbimo kūrim/i;

async function openSellChat(page: Page) {
  await page.locator("[data-nav-add-listing]:visible").first().click();
  await expect(page.locator(".agent-chat-strip")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page
      .locator(".agent-chat-strip .agent-chat-bubble-assistant")
      .last()
  ).toBeVisible({ timeout: 10_000 });
}

async function waitForAssistantReply(page: Page) {
  await expect(
    page.locator(".agent-chat-strip .agent-chat-bubble-assistant").last()
  ).toBeVisible({ timeout: 15_000 });
}

async function installCannedAgent(page: Page, reply: string) {
  await page.route("**/api/vauto-agent**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        reply,
        toolCalls: [],
        actions: { type: "none" },
        quickReplies: ["Viskas tinka", "Papildyti"],
      }),
    });
  });
}

test.describe("F9 — search/sell sesijos izoliacija", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("„Rodyk visus“ → Įdėti: švari sell sesija be URL query ir pinų", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedBuyerSession(page);
    await page.goto("/?q=Rodyk%20visus");
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 20_000,
    });
    // Let the auto browse-all turn finish so the sell reset can cleanly
    // replace it (no in-flight reply race).
    await expect(page.locator(".agent-chat-strip")).toContainText(
      /aktyvių skelbimų|naujausi skelbimai/i,
      { timeout: 15_000 }
    );

    await openSellChat(page);

    // URL neturi senos paieškos query; chatas rodo sell sveikinimą.
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBeNull();
    const lastAssistant = page
      .locator(".agent-chat-strip .agent-chat-bubble-assistant")
      .last();
    await expect(lastAssistant).toBeVisible({ timeout: 10_000 });
    await expect(lastAssistant).toContainText(WELCOME_RE);
    // Jokių matomų ai-interpretation chips (paieškos konteksto) sell pokalbyje.
    await expect(page.locator("[data-ai-interpretation]")).toBeHidden();
  });

  test("Vilnius paieška → naujas sell turnas: miestas neišpilsto į sveikinimą", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedBuyerSession(page);
    await page.goto("/search?q=Vilnius");
    await expect(page.locator("#listing-results")).toBeAttached({
      timeout: 20_000,
    });

    await openSellChat(page);
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBeNull();
    expect(url.pathname).toBe("/");
    const lastAssistant = page
      .locator(".agent-chat-strip .agent-chat-bubble-assistant")
      .last();
    await expect(lastAssistant).toContainText(WELCOME_RE);
  });

  test("sell → search → naujas sell: remount išlieka švarus", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedBuyerSession(page);
    await page.goto("/");
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 20_000,
    });

    await openSellChat(page);
    await page.locator("[data-nav-add-listing]:visible").first().click();
    await expect(page.locator(".agent-chat-strip")).toBeVisible();
    await page.goto("/search?q=Vilnius");
    await expect(page.locator("#listing-results")).toBeAttached({
      timeout: 20_000,
    });
    await openSellChat(page);
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBeNull();
    const lastAssistant = page
      .locator(".agent-chat-strip .agent-chat-bubble-assistant")
      .last();
    await expect(lastAssistant).toContainText(WELCOME_RE);
  });

  test("vartotojas su aktyviais skelbimais: pirmame sell turnе nėra Derybininko reklamos", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedBuyerSession(page);
    await page.addInitScript(() => {
      const uid = "e2e-buyer";
      const listing = {
        id: "e2e-owned-1",
        title: "Senasis skelbimas",
        price: 100,
        priceLabel: "100 €",
        location: "Kaunas",
        category: "electronics",
        description: "e2e",
        images: [],
        image: "",
        sellerId: uid,
        status: "active",
        tags: [],
        attributes: {},
        createdAt: new Date().toISOString(),
        slug: "senasis-skelbimas",
        contact: "+37060000077",
        isAiTwinActive: false,
      };
      localStorage.setItem(`vauto_listings_v1__${uid}`, JSON.stringify([listing]));
      localStorage.setItem("vauto_listings_v1", JSON.stringify([listing]));
    });
    await installCannedAgent(
      page,
      "Paruošiau juodraščio pradžią — ką parduodate?"
    );

    await page.goto("/");
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 20_000,
    });
    await openSellChat(page);
    await page.locator('.agent-chat-composer input[type="text"]').first().fill(
      "Noriu parduoti juodą USB klaviatūrą"
    );
    await page.keyboard.press("Enter");

    await waitForAssistantReply(page);
    // The first sell reply must remain listing-only — no negotiator ad.
    await expect(page.locator(".agent-chat-strip")).not.toContainText(
      /Derybinink/i
    );
  });
});

test.describe("F9 — Mano skelbimai navigacija", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("asistento overlay užsidaro; puslapis atsidaro su žinutėmis", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedBuyerSession(page);
    await page.goto("/");
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 20_000,
    });

    await openSellChat(page);
    await expect(page.locator(".agent-chat-strip")).toBeVisible();

    // Any navigation into the cabinet must exit assistant mode (pathname
    // effect covers every entry point: nav, dropdown, deep link).
    await page.goto("/mano-skelbimai/");
    await expect(page).toHaveURL(/mano-skelbimai/, { timeout: 15_000 });
    await expect(page.locator("#listing-results, [data-mano-skelbimai], .vauto-bottom-nav, [data-mobile-bottom-nav]").first()).toBeAttached({ timeout: 15_000 });
    // Assistant overlay must NOT persist on the cabinet page.
    await expect(page.locator(".agent-chat-strip")).toHaveCount(0);
  });
});
