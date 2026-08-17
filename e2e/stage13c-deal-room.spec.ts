import { test, expect, type Browser, type Page } from "@playwright/test";
import { horizontalOverflowPx } from "./helpers/stage12b-comprehension";
import {
  attachHarnessToPage,
  dismissUiChrome,
  harnessJson,
  mintHarnessToken,
  seedHarnessUser,
  startStage12aHarness,
  type Stage12aHarness,
} from "./helpers/stage12a-harness";

test.describe.configure({ mode: "serial" });

const BUYER_ID = "buyer-13c";
const SELLER_ID = "seller-13c";
const STRANGER_ID = "stranger-13c";

let harness: Stage12aHarness;

test.beforeAll(async () => {
  harness = await startStage12aHarness(4012);
});

test.afterAll(async () => {
  await harness?.stop();
});

test.beforeEach(async () => {
  try {
    const res = await fetch(`${harness.apiUrl}/api/health`);
    if (res.ok) return;
  } catch {
    /* restart below */
  }
  await harness?.stop().catch(() => undefined);
  harness = await startStage12aHarness(4012);
});

async function openDealRoom(
  browser: Browser,
  user: { id: string; name: string },
  txId: string,
  viewport?: { width: number; height: number },
  apiUrl = harness.apiUrl
): Promise<{ page: Page; token: string; context: import("@playwright/test").BrowserContext }> {
  const token = await mintHarnessToken(apiUrl, user.id);
  const context = await browser.newContext(viewport ? { viewport } : undefined);
  const page = await context.newPage();
  await attachHarnessToPage(page, apiUrl);
  await seedHarnessUser(page, { userId: user.id, name: user.name, token });
  await page.goto(`/sandoriai/?id=${encodeURIComponent(txId)}`);
  await dismissUiChrome(page);
  return { page, token, context };
}

async function seedListing(
  input: {
    id: string;
    category: string;
    verticalId: string;
    title: string;
  },
  apiUrl = harness.apiUrl
) {
  const res = await harnessJson(apiUrl, "/api/test/seed-listing", {
    method: "POST",
    body: {
      id: input.id,
      sellerId: SELLER_ID,
      title: input.title,
      price: 1000,
      category: input.category,
      verticalId: input.verticalId,
      attributes: { _canonicalVertical: input.verticalId },
    },
  });
  expect(res.status, res.text).toBe(201);
}

async function startTx(buyerToken: string, listing: string, apiUrl = harness.apiUrl) {
  const res = await harnessJson(apiUrl, `/api/listings/${listing}/transactions`, {
    token: buyerToken,
    method: "POST",
    body: { idempotencyKey: `idemp-13c-${listing}-${Date.now()}` },
  });
  expect(res.status, res.text).toBeLessThan(300);
  const tx = res.json?.transaction as { id: string } | undefined;
  expect(tx?.id).toBeTruthy();
  return tx!.id;
}

test("A — Transport happy path offer → counter → accept", async ({ browser }) => {
  test.setTimeout(120_000);
  await seedListing({
    id: "L-13C-A",
    category: "transport",
    verticalId: "TRANSPORT",
    title: "13C transportas",
  });
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const txId = await startTx(buyerToken, "L-13C-A");
  const buyer = await openDealRoom(browser, { id: BUYER_ID, name: "13C Pirkėjas" }, txId);
  await expect(buyer.page.locator("[data-deal-room]")).toBeVisible({ timeout: 20_000 });
  await buyer.page.locator("#offer-cents").fill("50000");
  await buyer.page.locator("[data-submit-offer]").click();
  await expect(buyer.page.locator('[data-deal-state="OFFER_PENDING"]')).toBeVisible({
    timeout: 15_000,
  });

  const seller = await openDealRoom(
    browser,
    { id: SELLER_ID, name: "13C Pardavėjas" },
    txId
  );
  await expect(seller.page.locator("[data-submit-counter]")).toBeVisible({ timeout: 20_000 });
  await seller.page.locator("[data-counter-amount]").fill("550");
  await seller.page.locator("[data-submit-counter]").click();
  await expect(seller.page.getByText(/Priešpasiūlymas pateiktas/i)).toBeVisible({
    timeout: 15_000,
  });

  await buyer.page.goto(`/sandoriai/?id=${encodeURIComponent(txId)}`);
  await dismissUiChrome(buyer.page);
  await expect(buyer.page.locator("[data-accept-offer]")).toBeVisible({ timeout: 20_000 });
  await buyer.page.locator("[data-accept-offer]").click();
  await expect(buyer.page.locator('[data-deal-state="AGREED"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(buyer.page.locator("[data-deal-history]")).toContainText("500");
  await buyer.context.close();
  await seller.context.close();
});

test("B — Real estate: negotiation yes, checkout no", async ({ browser }) => {
  test.setTimeout(90_000);
  await seedListing({
    id: "L-13C-B",
    category: "real_estate",
    verticalId: "REAL_ESTATE",
    title: "13C butas",
  });
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const sellerToken = await mintHarnessToken(harness.apiUrl, SELLER_ID);
  const txId = await startTx(buyerToken, "L-13C-B");
  const created = await harnessJson(harness.apiUrl, `/api/transactions/${txId}/offers`, {
    token: buyerToken,
    method: "POST",
    body: { amountCents: 15000000, currency: "EUR", idempotencyKey: `13c-b-${Date.now()}` },
  });
  expect(created.status, created.text).toBeLessThan(300);
  const offer = created.json?.offer as { id: string; version: number };
  const accepted = await harnessJson(harness.apiUrl, `/api/offers/${offer.id}/accept`, {
    token: sellerToken,
    method: "POST",
    body: { idempotencyKey: `13c-b-acc-${Date.now()}`, expectedVersion: offer.version },
  });
  expect(accepted.status, accepted.text).toBeLessThan(300);
  const pay = await harnessJson(harness.apiUrl, `/api/transactions/${txId}/payment-intent`, {
    token: buyerToken,
    method: "POST",
    body: { idempotencyKey: `13c-b-pay-${Date.now()}` },
  });
  expect(pay.status).toBe(403);
  const buyer = await openDealRoom(browser, { id: BUYER_ID, name: "13C Pirkėjas" }, txId);
  await expect(buyer.page.locator("[data-deal-room]")).toBeVisible({ timeout: 20_000 });
  await expect(buyer.page.locator("[data-start-payment]")).toHaveCount(0);
  await buyer.context.close();
});

test("D — Jobs fail-closed: no purchase offer CTA", async ({ browser }) => {
  test.setTimeout(60_000);
  await seedListing({
    id: "L-13C-D",
    category: "jobs",
    verticalId: "JOBS",
    title: "13C darbas",
  });
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const txId = await startTx(buyerToken, "L-13C-D");
  const offer = await harnessJson(harness.apiUrl, `/api/transactions/${txId}/offers`, {
    token: buyerToken,
    method: "POST",
    body: { amountCents: 1000, currency: "EUR", idempotencyKey: `13c-d-${Date.now()}` },
  });
  expect(offer.status).toBe(403);
  const buyer = await openDealRoom(browser, { id: BUYER_ID, name: "13C Pirkėjas" }, txId);
  await expect(buyer.page.locator("[data-deal-room]")).toBeVisible({ timeout: 20_000 });
  await expect(buyer.page.locator("[data-submit-offer]")).toHaveCount(0);
  await expect(buyer.page.locator("[data-jobs-contact]")).toBeVisible();
  await expect(buyer.page.locator("[data-start-payment]")).toHaveCount(0);
  await buyer.context.close();
});

test("E — IDOR stranger cannot open Deal Room", async ({ browser }) => {
  test.setTimeout(60_000);
  await seedListing({
    id: "L-13C-E",
    category: "electronics",
    verticalId: "ELECTRONICS",
    title: "13C elektronika",
  });
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const txId = await startTx(buyerToken, "L-13C-E");
  const stranger = await openDealRoom(
    browser,
    { id: STRANGER_ID, name: "Svetimas" },
    txId
  );
  await expect(stranger.page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(stranger.page.locator("[data-submit-offer]")).toHaveCount(0);
  await stranger.context.close();
});

test("L — mobile 375px Deal Room, no overflow, CTA and keyboard", async ({ browser }) => {
  test.setTimeout(90_000);
  await seedListing({
    id: "L-13C-L",
    category: "electronics",
    verticalId: "ELECTRONICS",
    title: "13C mobilus",
  });
  const buyerToken = await mintHarnessToken(harness.apiUrl, "buyer-13c-l");
  const txId = await startTx(buyerToken, "L-13C-L");
  const buyer = await openDealRoom(
    browser,
    { id: "buyer-13c-l", name: "13C Pirkėjas" },
    txId,
    { width: 375, height: 812 }
  );
  try {
    await expect(buyer.page.locator("[data-deal-room]")).toBeVisible({ timeout: 20_000 });
    expect(await horizontalOverflowPx(buyer.page)).toBeLessThanOrEqual(1);
    const offer = buyer.page.locator("#offer-cents");
    await expect(offer).toBeVisible();
    await offer.focus();
    await expect(offer).toBeFocused();
    await offer.fill("19900");
    const cta = buyer.page.locator("[data-submit-offer]");
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(80);
    await cta.click();
    await expect(buyer.page.locator('[data-deal-state="OFFER_PENDING"]')).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await buyer.context.close();
  }
});
