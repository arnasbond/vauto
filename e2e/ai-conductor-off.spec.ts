import { test } from "@playwright/test";
import {
  mockUnregisteredBarcodeLookup,
  runUnregisteredBarcodeAgentFlow,
} from "./helpers/barcode-agent-flow";

/** Legacy path when conductor is explicitly disabled via runtime-config. */
test.describe("AI conductor disabled (legacy fallback)", () => {
  test("barcode flow works when conductorEnabled is false", async ({ page }) => {
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
    await mockUnregisteredBarcodeLookup(page);
    await runUnregisteredBarcodeAgentFlow(page);
  });
});
