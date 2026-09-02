import { expect, type Locator, type Page, type Route } from "@playwright/test";

export const CERTIFIED_VERTICALS = [
  "Transportas",
  "Nekilnojamas turtas",
  "Elektronika",
  "Paslaugos",
  "Darbas",
  "Namai ir buitis",
] as const;

export const VEHICLE_ATTR_RE =
  /\bVIN\b|markė|marke|modelis|rida\s*\(?km\)?|kėbulo numeris/i;

export const FALSE_GUARANTEE_RE =
  /VAUTO garantuoja|pirkėjo apsaugos mokestis|AI saugumo garantija|Pradėti saugų sandorį|visiškai saug[uai]|be rizikos/i;

export function falseGuaranteeHit(text: string): string | null {
  const abs = text.match(FALSE_GUARANTEE_RE);
  if (abs) return abs[0];
  const copies = text.match(/[^.!\n]*100\s*%\s*saug[^.!\n]*/gi) ?? [];
  for (const c of copies) {
    if (!/nenaudojame|ne vartojame|nedeklaruojame/i.test(c)) return c.trim();
  }
  return null;
}

export async function dismissGdpr(page: Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

/**
 * Static `out/` export has no live agent/DB. Same pattern as smoke
 * `installSupervisorSearchMocks` — stubs conductor off + `/api/vauto-agent`.
 * Does not fabricate UI copy; it only lets the real first-time search path
 * reach a results or empty state.
 */
export async function installFirstTimeSearchStub(
  page: Page,
  mode: "hits" | "empty" | "re"
) {
  await page.route("**/runtime-config.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiUrl: "https://vauto-api.onrender.com",
        conductorEnabled: false,
      }),
    });
  });

  // Deterministic canned agent result keyed to the fixture mode. Every mode
  // returns a fixed, repeatable `actions.listingIds` set so the listing grid has
  // a stable object set to assert against (never "passes if data exists").
  const agentResult = (() => {
    switch (mode) {
      case "empty":
        return {
          ok: true,
          reply:
            "Šiuo metu skelbimų pagal šią užklausą neradome. Įjunkite „Laukiu šio daikto“ — pranešime, kai atsiras, arba pabandykite kitą frazę.",
          actions: {
            type: "empty_search",
            searchQuery: "zzzzqwerty999neegzistuoja",
          },
          toolCalls: [],
        };
      case "re":
        // Deterministic real-estate fixture: lt-nt-004 is a canonical REAL_ESTATE
        // "Butas" in Telšiai. The query "butas Telšiai" is a canonical 13A/13B
        // MATCH for it, so the pinned card ALWAYS renders (never a silent pass on
        // a sparse/absent result set). 18N-9 asserts this RE card WITHOUT Omniva,
        // and 18N-7/18N-17 get a deterministic RE grid/object set to traverse.
        return {
          ok: true,
          reply: "Radau nekilnojamojo turto variantų.",
          actions: {
            type: "search",
            listingIds: ["lt-nt-004"],
            searchQuery: "butas Telšiai",
          },
          toolCalls: [],
        };
      case "hits":
      default:
        return {
          ok: true,
          reply: "Radau elektronikos variantus — peržiūrėkite tinklelyje.",
          actions: {
            type: "search",
            listingIds: ["lt-el-004"],
            searchQuery: "MacBook Pro M3 Max",
          },
          toolCalls: [],
        };
    }
  })();

  const fulfill = async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    if (url.includes("/stream")) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: `data: ${JSON.stringify({ type: "final", result: agentResult })}\n\n`,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(agentResult),
    });
  };

  await page.route("**/api/vauto-agent**", fulfill);
}

export async function openHome(
  page: Page,
  viewport?: { width: number; height: number },
  opts?: { searchStub?: "hits" | "empty" | "re" }
) {
  if (viewport) await page.setViewportSize(viewport);
  if (opts?.searchStub) await installFirstTimeSearchStub(page, opts.searchStub);
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
}

export async function expectInFirstViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "element has a bounding box").toBeTruthy();
  expect(viewport, "page has a viewport").toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(-8);
  expect(box!.y).toBeLessThan(viewport!.height);
  expect(box!.y + Math.min(box!.height, 20)).toBeLessThanOrEqual(
    viewport!.height + 8
  );
}

export function homeSearchbox(page: Page): Locator {
  return page
    .getByRole("search", { name: /Skelbimų paieška/i })
    .getByRole("searchbox");
}

export async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
}

export async function visibleBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

export async function tabUntilFocused(
  page: Page,
  match: (el: { tag: string; name: string }) => boolean,
  maxTabs = 48
): Promise<{ tag: string; name: string }> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return { tag: "", name: "" };
      const name =
        el.getAttribute("aria-label") ||
        el.closest("[aria-label]")?.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el as HTMLInputElement).placeholder ||
        el.textContent?.replace(/\s+/g, " ").trim() ||
        "";
      return { tag: el.tagName.toLowerCase(), name };
    });
    if (match(info)) return info;
  }
  throw new Error("Keyboard focus never reached the expected control");
}

export function categoryButtons(page: Page): Locator {
  return page.locator("[data-home-category-grid] button");
}

/**
 * The canonical, always-present "add listing" nav affordance (MASTER Wave 2
 * correction — the hero no longer carries a dedicated seller button; the
 * persistent header/bottom-nav "Įdėti" control is the discoverable sell path).
 * Multiple responsive variants can share this hook (desktop header text
 * button, mobile header icon button, mobile bottom-nav tab) — `:visible`
 * plus `.first()` picks the one actually rendered at the current viewport.
 */
export function navAddListingCta(page: Page): Locator {
  return page.locator("[data-nav-add-listing]:visible").first();
}

export const EMPTY_SEARCH_HINT_RE =
  /Įveskite, ko ieškote, arba pasirinkite vieną iš pavyzdžių/i;

export function emptySearchHint(page: Page): Locator {
  return page.locator("[data-search-empty-hint]");
}

export function isMarketplaceSearchApiPost(url: string, method: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  return /vauto-agent|\/api\/search|\/conductor/i.test(url);
}

export async function submitBlankSearch(
  page: Page,
  value: "" | "   "
): Promise<{ urlBefore: string; apiPosts: string[] }> {
  const search = homeSearchbox(page);
  await expect(search).toBeVisible();
  const urlBefore = page.url();
  const apiPosts: string[] = [];
  const onRequest = (req: { url: () => string; method: () => string }) => {
    if (isMarketplaceSearchApiPost(req.url(), req.method())) {
      apiPosts.push(req.url());
    }
  };
  page.on("request", onRequest);
  await search.fill(value);
  await search.press("Enter");
  await expect(emptySearchHint(page)).toBeVisible();
  page.off("request", onRequest);
  return { urlBefore, apiPosts };
}
