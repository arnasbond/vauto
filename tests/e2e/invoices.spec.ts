import { test, expect } from "@playwright/test";
import { buildInvoiceSeed, E2E_SELLER_ID } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
  seedDemoUser,
} from "./helpers/seed";

test.describe("Enterprise — sąskaitos-faktūros", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("Po apmokėjimo PDF sąskaita atidaroma nustatymuose ir turi Spausdinti / PDF", async ({
    page,
  }) => {
    const invoice = buildInvoiceSeed(E2E_SELLER_ID);
    await forceOfflineCatalog(page);
    await seedDemoUser(page);
    await page.addInitScript(
      ({ inv, uid }) => {
        localStorage.setItem("vauto_active_user_id_v1", uid);
        localStorage.setItem("vauto_invoices_v1", JSON.stringify([inv]));
        localStorage.setItem(`vauto_invoices_v1__${uid}`, JSON.stringify([inv]));
      },
      { inv: invoice, uid: E2E_SELLER_ID }
    );

    await page.goto("/profile/settings/");
    await acceptGdprConsentIfPrompted(page);

    await expect(
      page.getByRole("heading", { name: /Mokėjimų istorija ir Sąskaitos/i })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(invoice.number)).toBeVisible();

    await page.getByRole("button", { name: /Sąskaita/i }).first().click();
    await expect(page.locator("#vauto-invoice-print")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Sąskaita-faktūra/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Spausdinti \/ PDF/i })
    ).toBeVisible();

    // Download/print capability: print handler is wired (window.print).
    const printCalled = await page.evaluate(() => {
      let called = false;
      const original = window.print;
      window.print = () => {
        called = true;
      };
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Spausdinti\s*\/\s*PDF/i.test(b.textContent || "")
      );
      btn?.click();
      window.print = original;
      return called;
    });
    expect(printCalled).toBe(true);
  });
});
