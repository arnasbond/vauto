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
  // R5 — the '+' nav opens the STANDALONE manual form (/add), not the AI chat.
  await page.locator("[data-nav-add-listing]:visible").first().click();
  await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({
    timeout: 15_000,
  });
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

    // URL neturi senos paieškos query; atsidarė standalone manual forma.
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBeNull();
    expect(url.pathname.replace(/\/$/, "") || "/").toBe("/add");
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible();
    // Jokių matomų ai-interpretation chips (paieškos konteksto) manual formoje.
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
    expect(url.pathname.replace(/\/$/, "") || "/").toBe("/add");
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible();
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
    await page.goto("/search?q=Vilnius");
    await expect(page.locator("#listing-results")).toBeAttached({
      timeout: 20_000,
    });
    await openSellChat(page);
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBeNull();
    expect(url.pathname.replace(/\/$/, "") || "/").toBe("/add");
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible();
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
    // R5 — the standalone manual form has no AI reply, so no negotiator ad can
    // be injected on the first sell turn.
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible();
    await expect(page.locator('[data-prepublish-modal="1"]')).not.toContainText(
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
    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible();

    // Any navigation into the cabinet must exit the manual form.
    await page.goto("/mano-skelbimai/");
    await expect(page).toHaveURL(/mano-skelbimai/, { timeout: 15_000 });
    await expect(page.locator("#listing-results, [data-mano-skelbimai], .vauto-bottom-nav, [data-mobile-bottom-nav]").first()).toBeAttached({ timeout: 15_000 });
    // Manual form must NOT persist on the cabinet page.
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);
  });
});
