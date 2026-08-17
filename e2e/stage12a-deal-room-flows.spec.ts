import { test, expect, type Browser, type Page } from "@playwright/test";
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

const BUYER_ID = "buyer-12a";
const SELLER_ID = "seller-12a";
const STRANGER_ID = "stranger-12a";

let harness: Stage12aHarness;
let listingId = "L-12A-HAPPY";

test.beforeAll(async () => {
  harness = await startStage12aHarness();
});

test.afterAll(async () => {
  await harness?.stop();
});

async function openDealRoom(
  browser: Browser,
  user: { id: string; name: string },
  txId: string,
  viewport?: { width: number; height: number }
): Promise<{ page: Page; token: string }> {
  const token = await mintHarnessToken(harness.apiUrl, user.id);
  const context = await browser.newContext(
    viewport ? { viewport } : undefined
  );
  const page = await context.newPage();
  await attachHarnessToPage(page, harness.apiUrl);
  await seedHarnessUser(page, { userId: user.id, name: user.name, token });
  await page.goto(`/sandoriai/?id=${encodeURIComponent(txId)}`);
  await dismissUiChrome(page);
  return { page, token };
}

async function seedListing(id: string) {
  const res = await harnessJson(harness.apiUrl, "/api/test/seed-listing", {
    method: "POST",
    body: { id, sellerId: SELLER_ID, title: "VAUTO 12A Citroën C4", price: 1000 },
  });
  expect(res.status, res.text).toBe(201);
  return id;
}

async function startTx(buyerToken: string, listing: string) {
  const res = await harnessJson(
    harness.apiUrl,
    `/api/listings/${listing}/transactions`,
    {
      token: buyerToken,
      method: "POST",
      body: { idempotencyKey: `idemp-${listing}-${Date.now()}` },
    }
  );
  expect(res.status, res.text).toBeLessThan(300);
  const tx = res.json?.transaction as { id: string } | undefined;
  expect(tx?.id).toBeTruthy();
  return tx!.id;
}

/** Static export `page.reload()` can drop `/sandoriai/?id=` (list view). Re-open like 13C. */
async function reopenDeal(page: Page, txId: string) {
  await page.goto(`/sandoriai/?id=${encodeURIComponent(txId)}`);
  await dismissUiChrome(page);
}

test("1 happy path: Deal Room buyer/seller against real harness", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  listingId = await seedListing("L-12A-HAPPY");
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const sellerToken = await mintHarnessToken(harness.apiUrl, SELLER_ID);
  const txId = await startTx(buyerToken, listingId);

  const buyer = await openDealRoom(
    browser,
    { id: BUYER_ID, name: "12A Pirkėjas" },
    txId
  );
  await expect(buyer.page.locator("[data-deal-room]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(buyer.page.getByText(/Pirkėjo kambarys/i)).toBeVisible();
  await buyer.page.locator("#offer-cents").fill("95000");
  await buyer.page.locator("[data-submit-offer]").click();
  await expect(buyer.page.locator('[data-deal-state="OFFER_PENDING"]')).toBeVisible({
    timeout: 15_000,
  });

  const seller = await openDealRoom(
    browser,
    { id: SELLER_ID, name: "12A Pardavėjas" },
    txId
  );
  await expect(seller.page.locator("[data-accept-offer]")).toBeVisible({
    timeout: 20_000,
  });
  await seller.page.locator("[data-accept-offer]").click();
  await expect(seller.page.locator('[data-deal-state="AGREED"]')).toBeVisible({
    timeout: 15_000,
  });

  await reopenDeal(buyer.page, txId);
  await expect(buyer.page.locator("[data-start-payment]")).toBeVisible({
    timeout: 20_000,
  });
  await buyer.page.locator("[data-start-payment]").click();
  await expect(buyer.page.getByText(/Mokėjimas paruoštas/i)).toBeVisible({
    timeout: 15_000,
  });

  const paid = await harnessJson(
    harness.apiUrl,
    "/api/test/simulate-payment-success",
    { token: buyerToken, method: "POST", body: { transactionId: txId } }
  );
  expect(paid.status, paid.text).toBeLessThan(300);

  await reopenDeal(seller.page, txId);
  await expect(seller.page.locator("[data-create-label]")).toBeVisible({
    timeout: 20_000,
  });
  await seller.page.locator("#omniva-track").fill("TESTTRACK12");
  await seller.page.locator("#omniva-term").fill("VNO1");
  await seller.page.locator("[data-create-label]").click();
  await expect(seller.page.locator("[data-omniva-tracking]")).toBeVisible({
    timeout: 15_000,
  });

  const track = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/delivery/tracking`,
    { token: sellerToken }
  );
  const delivery = track.json?.delivery as { trackingCode?: string } | undefined;
  expect(delivery?.trackingCode).toBeTruthy();
  const carrier = await harnessJson(harness.apiUrl, "/api/test/carrier-status", {
    token: sellerToken,
    method: "POST",
    body: { trackingCode: delivery!.trackingCode, status: "IN_TRANSIT" },
  });
  expect(carrier.status, carrier.text).toBe(200);
  const synced = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/delivery/sync-status`,
    {
      token: sellerToken,
      method: "POST",
      body: { idempotencyKey: `sync-${txId}` },
    }
  );
  expect(synced.status, synced.text).toBeLessThan(300);

  await reopenDeal(buyer.page, txId);
  await expect(buyer.page.locator("[data-confirm-delivery]")).toBeVisible({
    timeout: 20_000,
  });
  await buyer.page.locator("[data-confirm-delivery]").click();
  await expect(
    buyer.page.getByText(/Gavimas patvirtintas|Sandoris užbaigtas|užbaigiamas/i).first()
  ).toBeVisible({ timeout: 20_000 });

  const completeBtn = buyer.page.locator("[data-complete-deal]");
  if (await completeBtn.isVisible().catch(() => false)) {
    await completeBtn.click();
  }

  await expect(buyer.page.locator("[data-verified-review-form]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    buyer.page.getByText(/užbaigtu \(COMPLETED\) sandoriu/i)
  ).toBeVisible();
  await buyer.page.locator("[data-submit-verified-review]").click();
  await expect(buyer.page.getByText(/Jūs jau įvertinote|Ačiū/i).first()).toBeVisible({
    timeout: 15_000,
  });

  await reopenDeal(seller.page, txId);
  await expect(seller.page.locator("[data-verified-review-form]")).toBeVisible({
    timeout: 20_000,
  });
  await seller.page.locator("[data-submit-verified-review]").click();
  await expect(seller.page.getByText(/Jūs jau įvertinote|Ačiū/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const sellerRep = await harnessJson(
    harness.apiUrl,
    `/api/users/${SELLER_ID}/reputation`
  );
  expect(sellerRep.status).toBe(200);
  expect(Number(sellerRep.json?.totalReviewsCount ?? 0)).toBeGreaterThan(0);
  expect(sellerRep.json?.ratingAverage).not.toBeNull();

  await buyer.page.context().close();
  await seller.page.context().close();
});

test("2 foreign user: Deal Room 404, review 403", async () => {
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const listing = await seedListing("L-12A-IDOR");
  const txId = await startTx(buyerToken, listing);
  const stranger = await mintHarnessToken(harness.apiUrl, STRANGER_ID);

  const room = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/deal-room`,
    { token: stranger }
  );
  expect(room.status).toBe(404);

  const offer = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/offers`,
    {
      token: stranger,
      method: "POST",
      body: {
        amountCents: 100000,
        currency: "EUR",
        idempotencyKey: "stranger-offer-12a-xx",
      },
    }
  );
  expect([403, 404]).toContain(offer.status);

  const review = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/reviews`,
    {
      token: stranger,
      method: "POST",
      body: { rating: 5, comment: "hack" },
    }
  );
  expect([403, 404]).toContain(review.status);
});

test("3 review before COMPLETED is 403", async () => {
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const listing = await seedListing("L-12A-EARLY-REV");
  const txId = await startTx(buyerToken, listing);
  const review = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/reviews`,
    {
      token: buyerToken,
      method: "POST",
      body: { rating: 5 },
    }
  );
  expect(review.status).toBe(403);
});

test("4 forged revieweeId is 400", async () => {
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const listing = await seedListing("L-12A-FORGE");
  const txId = await startTx(buyerToken, listing);
  const review = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/reviews`,
    {
      token: buyerToken,
      method: "POST",
      body: { rating: 5, revieweeId: "forged-user" },
    }
  );
  expect(review.status).toBe(400);
});

test("5 concurrent double review: Promise.all 201+409, DB count 1", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const listing = await seedListing("L-12A-DUP");
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const sellerToken = await mintHarnessToken(harness.apiUrl, SELLER_ID);
  const txId = await startTx(buyerToken, listing);

  const offer = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/offers`,
    {
      token: buyerToken,
      method: "POST",
      body: {
        amountCents: 100000,
        currency: "EUR",
        idempotencyKey: `off-dup-${Date.now()}`,
      },
    }
  );
  expect(offer.status, offer.text).toBeLessThan(300);
  const offerId = (offer.json?.offer as { id?: string; version?: number } | undefined)?.id;
  const offerVersion =
    (offer.json?.offer as { version?: number } | undefined)?.version ?? 0;
  expect(offerId).toBeTruthy();

  const accepted = await harnessJson(
    harness.apiUrl,
    `/api/offers/${offerId}/accept`,
    {
      token: sellerToken,
      method: "POST",
      body: {
        idempotencyKey: `acc-dup-${Date.now()}`,
        expectedVersion: offerVersion,
      },
    }
  );
  expect(accepted.status, accepted.text).toBeLessThan(300);

  const ledger = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/payment-intent`,
    {
      token: buyerToken,
      method: "POST",
      body: { idempotencyKey: `pi-dup-${Date.now()}` },
    }
  );
  expect(ledger.status, ledger.text).toBeLessThan(300);
  const stripe = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/payment-intent/stripe-intent`,
    {
      token: buyerToken,
      method: "POST",
      body: { idempotencyKey: `spi-dup-${Date.now()}` },
    }
  );
  expect(stripe.status, stripe.text).toBeLessThan(300);
  const paid = await harnessJson(
    harness.apiUrl,
    "/api/test/simulate-payment-success",
    { token: buyerToken, method: "POST", body: { transactionId: txId } }
  );
  expect(paid.status, paid.text).toBeLessThan(300);

  const label = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/delivery/label`,
    {
      token: sellerToken,
      method: "POST",
      body: {
        idempotencyKey: `lbl-dup-${Date.now()}`,
        carrier: "OMNIVA",
        trackingCode: "DUPTRACK12",
        terminalId: "VNO1",
      },
    }
  );
  expect(label.status, label.text).toBeLessThan(300);
  const trackingCode = (label.json?.delivery as { trackingCode?: string })
    ?.trackingCode;
  await harnessJson(harness.apiUrl, "/api/test/carrier-status", {
    token: sellerToken,
    method: "POST",
    body: { trackingCode, status: "IN_TRANSIT" },
  });
  await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/delivery/sync-status`,
    {
      token: sellerToken,
      method: "POST",
      body: { idempotencyKey: `sync-dup-${Date.now()}` },
    }
  );
  const conf = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/delivery/confirm`,
    {
      token: buyerToken,
      method: "POST",
      body: { idempotencyKey: `conf-dup-${Date.now()}` },
    }
  );
  expect(conf.status, conf.text).toBeLessThan(300);
  const done = await harnessJson(
    harness.apiUrl,
    `/api/transactions/${txId}/complete`,
    {
      token: buyerToken,
      method: "POST",
      body: { idempotencyKey: `cmp-dup-${Date.now()}` },
    }
  );
  expect(done.status, done.text).toBeLessThan(300);

  const buyerContext = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${buyerToken}` },
  });
  const [res1, res2] = await Promise.all([
    buyerContext.request.post(`${harness.apiUrl}/api/transactions/${txId}/reviews`, {
      data: { rating: 5, comment: "Puiku 1" },
    }),
    buyerContext.request.post(`${harness.apiUrl}/api/transactions/${txId}/reviews`, {
      data: { rating: 4, comment: "Puiku 2" },
    }),
  ]);
  const statuses = [res1.status(), res2.status()].sort();
  expect(statuses).toEqual([201, 409]);
  const count = await harnessJson(
    harness.apiUrl,
    `/api/test/review-count?transactionId=${encodeURIComponent(txId)}`,
    { token: buyerToken }
  );
  expect(count.json?.count).toBe(1);
  await buyerContext.close();
});

test("6 mobile 375px + desktop labels and keyboard", async ({ browser }) => {
  const listing = await seedListing("L-12A-A11Y");
  const buyerToken = await mintHarnessToken(harness.apiUrl, BUYER_ID);
  const txId = await startTx(buyerToken, listing);

  const mobile = await openDealRoom(
    browser,
    { id: BUYER_ID, name: "12A Pirkėjas" },
    txId,
    { width: 375, height: 812 }
  );
  await expect(mobile.page.locator("[data-deal-room]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(mobile.page.getByText(/Pirkėjo kambarys/i)).toBeVisible();
  await expect(mobile.page.getByRole("button", { name: /Pateikti pasiūlymą/i })).toBeVisible();
  const overflow = await mobile.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  await mobile.page.locator("#offer-cents").focus();
  await mobile.page.keyboard.press("Tab");
  await expect(mobile.page.locator("[data-submit-offer]")).toBeFocused();
  await mobile.page.locator("[data-open-deal-help]").click();
  await expect(mobile.page.locator("[data-deal-help-dialog]")).toBeVisible();
  await expect(mobile.page.locator("[data-close-deal-help]")).toBeFocused();
  await mobile.page.keyboard.press("Escape");
  await expect(mobile.page.locator("[data-deal-help-dialog]")).toHaveCount(0);
  await expect(mobile.page.locator("[data-open-deal-help]")).toBeFocused();
  await mobile.page.context().close();

  const desktop = await openDealRoom(
    browser,
    { id: BUYER_ID, name: "12A Pirkėjas" },
    txId,
    { width: 1280, height: 800 }
  );
  await expect(desktop.page.locator("[data-deal-room]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    desktop.page.getByRole("heading", { name: /Pasiūlymas/i })
  ).toBeVisible();
  const desktopOverflow = await desktop.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(desktopOverflow.scrollWidth).toBeLessThanOrEqual(desktopOverflow.innerWidth);
  await desktop.page.context().close();
});
