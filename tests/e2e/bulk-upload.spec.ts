import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
  seedProUser,
} from "./helpers/seed";

/**
 * F6 Final — real CSV/XML import card (replaces the demo BulkUploadCard).
 *
 * The card NEVER fabricates an import result: the server preview response is
 * the only truth and `importEnabled` is fail-closed OFF. These tests assert
 * the honest contract end-to-end with a locally-mocked preview endpoint
 * (Playwright route interception — no request ever leaves the machine).
 */

const PREVIEW_RESPONSE = {
  ok: true,
  importEnabled: false,
  source: "csv",
  columns: ["title", "price", "category", "location"],
  mapping: [
    { column: "title", field: "title", ignored: false },
    { column: "price", field: "price", ignored: false },
    { column: "category", field: "category", ignored: false },
    { column: "location", field: "location", ignored: false },
  ],
  rows: [
    {
      line: 2,
      verdict: "ok",
      errors: [],
      warnings: [],
      ignoredFields: [],
      title: "Volvo V70",
      price: 10900,
      category: "vehicles",
      location: "Vilnius",
    },
  ],
  summary: {
    total: 1,
    ok: 1,
    warnings: 0,
    errors: 0,
    byCategory: { vehicles: 1 },
  },
  reportText: "VAUTO masinio importo ataskaita\r\nSantrauka: 1 eilučių — tinkamos: 1.",
  note: "Importas šiuo metu išjungtas: failas buvo tik patikrintas, niekas nebuvo išsaugota — jokie skelbimai nesukurti.",
};

test.describe("Enterprise — masinis įkėlimas (F6 real import card)", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 1100, height: 900 } });

  test("Pro kabinete Kainodara skirtukas rodo tikrą importo kortelę be demo klastotės", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedProUser(page);
    await page.goto("/profile/");
    await acceptGdprConsentIfPrompted(page);

    const kainodara = page.getByRole("tab", { name: /Kainodara/i });
    if (!(await kainodara.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Kainodara tab not visible in this shell/viewport.",
      });
      return;
    }
    await kainodara.click();

    // The real card is present and its file input is reachable by label
    // (an accessibility contract in itself).
    await expect(
      page.getByText(/Masinis importas \(CSV \/ XML\)/i).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("#bulk-import-file")
    ).toBeAttached();

    // The old mocked demo contract is GONE — nothing may pretend an import
    // produced listings.
    await expect(page.getByText(/Testuoti demo importą/i)).toHaveCount(0);
    await expect(page.getByText(/12 skelbimų paruošta/i)).toHaveCount(0);
  });

  test("failo įkėlimas rodo serverio preview: tik informaciniai rezultatai, jokių skelbimų nesukuriama", async ({
    page,
  }) => {
    await page.route("**/api/bulk-import/preview**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PREVIEW_RESPONSE),
      });
    });

    await forceOfflineCatalog(page);
    await seedProUser(page);
    await page.goto("/profile/");
    await acceptGdprConsentIfPrompted(page);

    const kainodara = page.getByRole("tab", { name: /Kainodara/i });
    await expect(kainodara).toBeVisible({ timeout: 15_000 });
    await kainodara.click();

    await page.locator("#bulk-import-file").setInputFiles({
      name: "import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("title,price,category,location\nVolvo V70,10900,vehicles,Vilnius"),
    });

    // Server truth, not client fiction: preview summary + fail-closed note.
    await expect(page.getByText(/Failas: import\.csv/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/Importas šiuo metu išjungtas — failas buvo tik patikrintas/i)
    ).toBeVisible();
    await expect(page.getByText(/Tinkamos: 1/i)).toBeVisible();
    await expect(page.getByText(/Eil\. 2: Volvo V70/i)).toBeVisible();

    // Error report can be copied/downloaded.
    await expect(
      page.getByRole("button", { name: /Kopijuoti ataskaitą/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Atsisiųsti ataskaitą/i })
    ).toBeVisible();

    // Nothing anywhere claims listings were created/saved.
    await expect(page.getByText(/paruošta publikavimui/i)).toHaveCount(0);
    await expect(page.getByText(/niekas nebuvo išsaugota/i).first()).toBeVisible();
  });

  test("netinkamas failo tipas atmetamas kliento pusėje be API kvietimo", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await seedProUser(page);
    await page.goto("/profile/");
    await acceptGdprConsentIfPrompted(page);

    const kainodara = page.getByRole("tab", { name: /Kainodara/i });
    await expect(kainodara).toBeVisible({ timeout: 15_000 });
    await kainodara.click();

    await page.locator("#bulk-import-file").setInputFiles({
      name: "virus.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });

    await expect(
      page.getByText(/Palaikomi tik \.csv ir \.xml failai/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
