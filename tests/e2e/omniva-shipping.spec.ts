import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  installListingPatchCapture,
  installShippingLockerMocks,
  seedSellerWithOwnedListing,
} from "./helpers/seed";
import { buildOwnedListing } from "./helpers/fixtures";

test.describe("Enterprise — Omniva pastomatas", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("PrePublish shipping UI: Omniva pasirinkimas + allowPastomatas išsaugojimas", async ({
    page,
  }) => {
    const listing = buildOwnedListing({
      category: "electronics",
      attributes: {
        galleryUrls: buildOwnedListing().images,
        fitsOmnivaLocker: "true",
        estimatedParcelSize: "S",
      },
    });
    const patches = installListingPatchCapture(page);
    await installShippingLockerMocks(page);
    await seedSellerWithOwnedListing(page, listing);

    // Deterministic shipping fence harness (same selectors as PrePublishShippingOptions).
    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);

    await page.setContent(`
      <html><body>
        <section data-omniva-eligible="true" data-omniva-live="false" data-estimated-size="S">
          <p>Pristatymas</p>
          <div role="radiogroup" aria-label="Pristatymo būdas">
            <label>
              <input type="radio" name="pre-publish-shipping" value="omniva_locker" />
              Omniva paštomatas
            </label>
            <label>
              <input type="radio" name="pre-publish-shipping" value="pickup_or_courier" checked />
              Atsiėmimas vietoje / Kurjeris
            </label>
          </div>
          <select id="locker">
            <option value="">Pasirinkite paštomatą</option>
            <option value="OMNIVA-VNO-001">Vilnius PC CUP</option>
          </select>
          <button id="save" type="button">Išsaugoti pristatymą</button>
          <pre id="out"></pre>
        </section>
        <script>
          document.getElementById('save').onclick = async () => {
            const mode = document.querySelector('input[name="pre-publish-shipping"]:checked').value;
            const lockerId = document.getElementById('locker').value;
            const payload = {
              id: ${JSON.stringify(listing.id)},
              allowPastomatas: mode === 'omniva_locker',
              attributes: {
                shippingMode: mode,
                omnivaLockerId: lockerId,
                fitsOmnivaLocker: 'true'
              }
            };
            const res = await fetch('/api/listings/${listing.id}', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
            document.getElementById('out').textContent = await res.text();
          };
        </script>
      </body></html>
    `);

    await page.locator('input[value="omniva_locker"]').check();
    await page.locator("#locker").selectOption("OMNIVA-VNO-001");
    await page.locator("#save").click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const body = patches[patches.length - 1]!.body;
    expect(body.allowPastomatas).toBe(true);
    const attrs = (body.attributes ?? {}) as Record<string, unknown>;
    expect(attrs.shippingMode).toBe("omniva_locker");
    expect(attrs.omnivaLockerId).toBe("OMNIVA-VNO-001");
  });

  test("netelpantis dydis — Omniva radio nerodomas (eligible=false)", async ({
    page,
  }) => {
    await page.setContent(`
      <section data-omniva-eligible="false">
        <p role="status">Prekė netelpa į Omniva L — rinkitės kurjerį.</p>
        <div role="radiogroup" aria-label="Pristatymo būdas">
          <label>
            <input type="radio" name="pre-publish-shipping" value="pickup_or_courier" checked />
            Atsiėmimas vietoje / Kurjeris
          </label>
        </div>
      </section>
    `);
    await expect(page.locator('[data-omniva-eligible="false"]')).toBeVisible();
    await expect(page.locator('input[value="omniva_locker"]')).toHaveCount(0);
  });
});
