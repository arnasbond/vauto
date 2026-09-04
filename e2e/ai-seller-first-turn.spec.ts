/**
 * P0 — client wire/session boundary (browser E2E with a STUBBED agent stream).
 *
 * The generic seed („Naujas skelbimas“ / empty title) is UI-only start state.
 * These tests drive the REAL „Įdėti“ UI path and assert the WIRE CONTRACT of
 * the first sell turn for all 8 canonical categories: the generic seed must
 * NEVER be shipped as an authoritative `context.listingDraft`, the current
 * turn's price must never synthesize a price-carrier draft, and the full user
 * text must reach the agent stream as the single fact authority.
 *
 * HONESTY: the stub supplies the draft fixture, so this file does NOT prove
 * server-side fact extraction. Server fact extraction is covered by
 * `server/src/ai/sell/__tests__/p0-full-text-fresh-create.test.ts` and
 * `server/src/ai/__tests__/p0-vauto-agent-http-integration.test.ts`.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
  seedDemoUser,
} from "../tests/e2e/helpers/seed";

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

const FIRST_TURN_ROWS: Array<{
  category: string;
  text: string;
  fixture: {
    title: string;
    category: string;
    price: number;
    location: string;
    attributes: Record<string, string>;
  };
  /** Canonical readiness for the stub draft: complete → PrePublish opens. */
  expectModal: boolean;
  /** Complete drafts may offer the publish chip; incomplete ones never do. */
  expectPublishChip: boolean;
  reply: string;
  quickReplies?: string[];
}> = [
  {
    category: "Transportas",
    text: "Parduodu naudotą juodą BMW 320d 2015 m., Kaune, kaina 9500 eurų",
    fixture: {
      title: "BMW 320d 2015",
      category: "vehicles",
      price: 9500,
      location: "Kaunas",
      attributes: { make: "BMW", model: "320d", year: "2015" },
    },
    expectModal: false,
    expectPublishChip: false,
    reply:
      "Paruošiau juodraštį „BMW 320d 2015“. Jei turite, parašykite: būklę — arba atidarykite PrePublish kortelę ir patikrinkite.",
    quickReplies: ["✏️ Papildyti"],
  },
  {
    category: "Nekilnojamas turtas",
    text: "Parduodu 3 kambarių butą Vilniuje, kaina 85000 eurų",
    fixture: {
      title: "3 kambarių butas Vilniuje",
      category: "real_estate",
      price: 85000,
      location: "Vilnius",
      attributes: { propertyType: "Butas", rooms: "3", sellerType: "private" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „3 kambarių butas Vilniuje“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
  {
    category: "Elektronika",
    text: "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų",
    fixture: {
      title: "iPhone 15 Pro 256 GB",
      category: "electronics",
      price: 850,
      location: "Kaunas",
      attributes: { deviceModel: "iPhone 15 Pro", storage: "256 GB", color: "Juoda" },
    },
    expectModal: false,
    expectPublishChip: false,
    reply:
      "Paruošiau juodraštį „iPhone 15 Pro 256 GB“. Jei turite, parašykite: būklę — arba atidarykite PrePublish kortelę ir patikrinkite.",
    quickReplies: ["✏️ Papildyti"],
  },
  {
    category: "Mada",
    text: "Parduodu naują juodą moterišką odinę striukę, M dydžio, Vilniuje, už 120 eurų",
    fixture: {
      title: "Moteriška odinė striukė",
      category: "clothing",
      price: 120,
      location: "Vilnius",
      attributes: { condition: "Nauja", clothingType: "Striukės", size: "M", color: "Juoda" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „Moteriška odinė striukė“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
  {
    category: "Namai ir buitis",
    text: "Parduodu naudotą ąžuolinį valgomojo stalą, Vilniuje, kaina 200 eurų",
    fixture: {
      title: "Ąžuolinis valgomojo stalas",
      category: "home",
      price: 200,
      location: "Vilnius",
      attributes: { material: "Ąžuolas", condition: "Naudota" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „Ąžuolinis valgomojo stalas“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
  {
    category: "Paslaugos",
    text: "Siūlau buto valymo paslaugas Vilniuje, 40 eurų per valandą",
    fixture: {
      title: "Buto valymo paslaugos",
      category: "services",
      price: 40,
      location: "Vilnius",
      attributes: { serviceType: "Valymas", serviceLocation: "Vilnius" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „Buto valymo paslaugos“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
  {
    category: "Darbas",
    text: "Siūlau darbą pardavėju Vilniuje, atlyginimas 1200 eurų",
    fixture: {
      title: "Pardavėjas Vilniuje",
      category: "jobs",
      price: 1200,
      location: "Vilnius",
      attributes: { jobTitle: "Pardavėjas", salaryMin: "1200", workType: "Biure" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „Pardavėjas Vilniuje“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
  {
    category: "Kita",
    text: "Parduodu seną vaikišką dviratuką, Kaune, kaina 80 eurų",
    fixture: {
      title: "Vaikiškas dviratukas",
      category: "other",
      price: 80,
      location: "Kaunas",
      attributes: { condition: "Naudota" },
    },
    expectModal: true,
    expectPublishChip: true,
    reply:
      "Paruošiau pilną „Vaikiškas dviratukas“ skelbimo juodraštį! Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.",
    quickReplies: ["🚀 Publikuoti", "✏️ Papildyti"],
  },
];

/**
 * Stub the agent stream. Every turn answers with a FRESH-CREATED concrete
 * draft for the row's fixture (as the real server would after fresh-create
 * extraction) and an honest reply. Request bodies are captured so the tests
 * can assert the wire contract of the first turn.
 */
async function installAgentStreamStub(
  page: Page,
  row: FIRST_TURN_ROWS[number]
) {
  const sentAgentBodies: CapturedCall[] = [];
  const sse = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`;

  await page.route("**/api/vauto-agent/stream", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sentAgentBodies.push({ url: route.request().url(), body });
    const listingDraft = {
      title: row.fixture.title,
      description: "",
      price: row.fixture.price,
      location: row.fixture.location,
      category: row.fixture.category,
      confidence: 0.8,
      listingFlowState: "AWAITING_CONFIRMATION",
      attributes: row.fixture.attributes,
    };
    const result = {
      ok: true,
      reply: row.reply,
      toolCalls: [],
      ...(row.quickReplies?.length ? { quickReplies: row.quickReplies } : {}),
      actions: { type: "listing_draft", listingDraft },
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse({ type: "status", message: "Galvoju…" }) +
        sse({ type: "final", result }),
    });
  });
  return { sentAgentBodies };
}

async function openAddListingChat(page: Page) {
  const addBtn = page
    .locator('[data-app-header] [data-nav-add-listing]')
    .filter({ visible: true });
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();
  const strip = page.locator(".agent-chat-strip");
  await expect(strip).toBeVisible({ timeout: 20_000 });
  return strip;
}

function chatComposer(page: Page) {
  return page.locator('form[aria-label="VAUTO asistento atsakymas"] input[type="text"]');
}

test.describe("P0 — kliento wire/session boundary (browser)", () => {
  test.describe("8 kategorijų kliento wire boundary matrica (stubbed agent stream)", () => {
    for (const row of FIRST_TURN_ROWS) {
      test(`wire boundary [${row.category}]: generinis seed nekeliauja kaip autoritetingas draftas; tekstas — vienintelis faktų šaltinis`, async ({ page }) => {
        await forceOfflineCatalog(page);
        await seedDemoUser(page);
        const { sentAgentBodies } = await installAgentStreamStub(page, row);

        await page.goto("/");
        await acceptGdprConsentIfPrompted(page);
        await openAddListingChat(page);

        const composer = chatComposer(page);
        await expect(composer).toBeVisible();
        await composer.fill(row.text);
        await composer.press("Enter");

        await expect
          .poll(() => sentAgentBodies.length, { timeout: 15_000 })
          .toBeGreaterThan(0);

        const first = sentAgentBodies[0]!;
        const ctx = (first.body.context ?? {}) as Record<string, unknown>;
        // The generic seed must never cross the wire as an existing draft:
        expect(ctx.listingDraft).toBeUndefined();
        // The current turn's price must never synthesize a price-carrier draft:
        expect(ctx.omitPriorListingDraft).toBe(true);
        expect(ctx.freshListingSession).toBe(true);
        expect(ctx.wizardMode).toBe("idle");
        // Search/sell isolation stays intact:
        expect(ctx.activeSearchFilters).toBeNull();

        // The full first-turn text is the single fact authority on the wire:
        const messages = (first.body.messages ?? []) as Array<{ role: string; text: string }>;
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        expect(lastUser?.text).toContain(row.text.slice(0, 24));

        // Honest reply rendered: concrete title, never the generic seed,
        // never the dishonest price-update intro:
        const strip = page.locator(".agent-chat-strip");
        await expect(strip).toContainText(row.fixture.title, { timeout: 15_000 });
        await expect(strip).not.toContainText("Naujas skelbimas");
        await expect(strip).not.toContainText("atnaujinau kainą");

        // Canonical PrePublish state: opens ONLY for complete drafts, and the
        // publish chip appears ONLY when the draft is ready.
        const modal = page.locator('[data-prepublish-modal="1"]');
        if (row.expectModal) {
          await expect(modal).toBeVisible({ timeout:20_000 });
          // The PrePublish card's title field carries the CONCRETE title —
          // never the generic seed:
          await expect(modal.locator('input[type="text"]').first()).toHaveValue(
            row.fixture.title
          );
          // The canonical publish CTA lives in the card while it is open:
          await expect(modal.locator('[data-prepublish-submit="1"]')).toHaveCount(1);
        } else {
          await expect(modal).toHaveCount(0);
        }
        if (!row.expectPublishChip) {
          await expect(strip).not.toContainText("🚀 Publikuoti");
        }
      });
    }
  });

  test("adversarial: ankstesnė paieškos sesija → „Įdėti“ → švarus first turn be paieškos konteksto", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const row = FIRST_TURN_ROWS[2]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, row);

    // Previous search context via a deep link, then the real „Įdėti“ path:
    await page.goto("/search?q=volvo");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill(FIRST_TURN_ROWS[2]!.text);
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const ctx = (sentAgentBodies[0]!.body.context ?? {}) as Record<string, unknown>;
    expect(ctx.listingDraft).toBeUndefined();
    expect(ctx.activeSearchFilters).toBeNull();
    expect(ctx.freshListingSession).toBe(true);
  });

  test("adversarial: senas nepilnas draftas → naujas „Įdėti“ → antro skelbimo turnas vėl švarus", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const rowA = FIRST_TURN_ROWS[2]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, rowA);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill(FIRST_TURN_ROWS[2]!.text);
    await composer.press("Enter");
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The first turn produced a concrete (incomplete) draft in aiDraft.
    await expect(page.locator(".agent-chat-strip")).toContainText(rowA.fixture.title, { timeout: 15_000 });

    // New „Įdėti“ — the old concrete draft must NOT survive into the next
    // first turn as an authoritative draft (the seed is UI-only again).
    await openAddListingChat(page);
    await composer.fill(FIRST_TURN_ROWS[3]!.text);
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(1);
    const last = sentAgentBodies[sentAgentBodies.length - 1]!;
    const ctx = (last.body.context ?? {}) as Record<string, unknown>;
    expect(ctx.listingDraft).toBeUndefined();
  });

  test("adversarial: sena užrakinta kaina → naujas objektas be kainos tekste → jokio sintetinio drafto", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const row = FIRST_TURN_ROWS[2]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, row);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    // Turn 1 locks a price from the text:
    await composer.fill("Parduodu telefon už 300 eurų");
    await composer.press("Enter");
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // New object, NO price in the text — a stale lock must never fabricate a
    // price-carrier draft for the fresh session:
    await openAddListingChat(page);
    await composer.fill("Parduodu seną dviratuką");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(1);
    const last = sentAgentBodies[sentAgentBodies.length - 1]!;
    const ctx = (last.body.context ?? {}) as Record<string, unknown>;
    expect(ctx.listingDraft).toBeUndefined();
  });

  test("adversarial: tekstas su kaina, metais ir talpa vienu metu — vis tiek jokio sintetinio drafto", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const row = FIRST_TURN_ROWS[2]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, row);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu iPhone 15 Pro 256 GB, 2015 m., 850 eurų, Kaune");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const ctx = (sentAgentBodies[0]!.body.context ?? {}) as Record<string, unknown>;
    expect(ctx.listingDraft).toBeUndefined();
  });

  test("adversarial: trumpas / dviprasmis tekstas — jokio išgalvoto drafto, tekstas siunčiamas", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const row = FIRST_TURN_ROWS[7]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, row);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill("Parduodu daiktą");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const first = sentAgentBodies[0]!;
    const ctx = (first.body.context ?? {}) as Record<string, unknown>;
    expect(ctx.listingDraft).toBeUndefined();
    const messages = (first.body.messages ?? []) as Array<{ role: string; text: string }>;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    expect(lastUser?.text).toContain("Parduodu daiktą");
  });

  test("adversarial: AI-down — nėra SSE, jokio juodraščio taikymo ir jokio PrePublish", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    await page.route("**/api/vauto-agent/stream", async (route) => {
      await route.abort();
    });

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill(FIRST_TURN_ROWS[2]!.text);
    await composer.press("Enter");

    // The client must fall back to the recovery reply, never fabricate a draft:
    await expect(
      page.locator(".agent-chat-strip .agent-chat-bubble-assistant")
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-prepublish-modal="1"]')).toHaveCount(0);
    await expect(page.locator(".agent-chat-strip")).not.toContainText("Naujas skelbimas");
  });

  test("regresija: realus konkretaus drafto kainos pakeitimas ir toliau keliauja kaip update", async ({ page }) => {
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    const row = FIRST_TURN_ROWS[2]!;
    const { sentAgentBodies } = await installAgentStreamStub(page, row);

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    await openAddListingChat(page);

    const composer = chatComposer(page);
    await expect(composer).toBeVisible();
    await composer.fill(FIRST_TURN_ROWS[2]!.text);
    await composer.press("Enter");
    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The concrete draft is now in aiDraft; a follow-up price change must
    // ship the CONCRETE draft with the new locked price (real update flow).
    await composer.fill("Kaina 700");
    await composer.press("Enter");

    await expect
      .poll(() => sentAgentBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(1);
    const last = sentAgentBodies[sentAgentBodies.length - 1]!;
    const ctx = (last.body.context ?? {}) as Record<string, unknown>;
    const draft = ctx.listingDraft as Record<string, unknown>;
    expect(draft).toBeTruthy();
    expect(draft.title).toBe(row.fixture.title);
    expect(draft.price).toBe(700);
  });
});
