import { test, expect } from "@playwright/test";
import {
  mockUnregisteredBarcodeLookup,
  runUnregisteredBarcodeAgentFlow,
} from "./helpers/barcode-agent-flow";

/** Uses baked out/runtime-config.json from sync:runtime-config (no route mock). */
test.describe("AI conductor runtime-config (live file)", () => {
  test("served runtime-config has conductorEnabled and barcode flow works", async ({
    page,
    request,
  }) => {
    const res = await request.get("/runtime-config.json");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.conductorEnabled).toBe(true);

    await mockUnregisteredBarcodeLookup(page);
    await runUnregisteredBarcodeAgentFlow(page);
  });
});
