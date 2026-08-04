import type { Page, Route } from "@playwright/test";
import path from "node:path";
import {
  acceptGdprConsentIfPrompted,
  seedAuthSession,
  seedDemoUser,
  seedProUser,
  stubOnboardingComplete,
} from "../../../e2e/helpers/seed-demo-user";
import {
  buildOwnedListing,
  E2E_BUYER_ID,
  E2E_SELLER_ID,
  type E2EListing,
} from "./fixtures";

export {
  acceptGdprConsentIfPrompted,
  seedDemoUser,
  seedProUser,
  stubOnboardingComplete,
};

const E2E_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

/** Force offline catalog so localStorage seeds drive the UI (no live Render catalog). */
export async function forceOfflineCatalog(page: Page) {
  await page.route("**/api/health**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, status: "offline-e2e" }),
    });
  });
}

export async function seedOwnedListings(
  page: Page,
  listings: E2EListing[],
  userId = E2E_SELLER_ID
) {
  await page.addInitScript(
    ({ items, uid }) => {
      localStorage.setItem("vauto_active_user_id_v1", uid);
      localStorage.setItem(`vauto_listings_v1__${uid}`, JSON.stringify(items));
      localStorage.setItem("vauto_listings_v1", JSON.stringify(items));
    },
    { items: listings, uid: userId }
  );
}

/** Drop any lingering SW / Cache API so tests always hit the built bundle. */
export async function purgeServiceWorkerCaches(page: Page) {
  await page.addInitScript(() => {
    const wipe = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* ignore */
      }
    };
    void wipe();
  });
}

export async function seedSellerWithOwnedListing(
  page: Page,
  listing: E2EListing = buildOwnedListing()
) {
  await purgeServiceWorkerCaches(page);
  await forceOfflineCatalog(page);
  await seedDemoUser(page);
  await seedOwnedListings(page, [listing], E2E_SELLER_ID);
}

export async function seedBuyerSession(page: Page) {
  await forceOfflineCatalog(page);
  await stubOnboardingComplete(page);
  await seedAuthSession(page, {
    id: E2E_BUYER_ID,
    name: "E2E Buyer",
    nickname: "E2E Buyer",
    avatar: E2E_AVATAR,
    phone: "+37060000077",
    city: "Kaunas",
    role: "private",
    profileType: "private",
    walletBalance: 0,
  });
}

/** Capture PATCH bodies for listing update assertions. */
export function installListingPatchCapture(page: Page) {
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  const handler = async (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === "PATCH" || method === "PUT") {
      let body: Record<string, unknown> = {};
      try {
        body = req.postDataJSON() as Record<string, unknown>;
      } catch {
        body = {};
      }
      patches.push({ url: req.url(), body });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: String(body.id ?? "e2e-owned-listing-1"),
          ...body,
          status: "active",
          sellerId: E2E_SELLER_ID,
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.continue();
  };
  void page.route("**/api/listings/**", handler);
  void page.route("**/api/listings/*", handler);
  return patches;
}

/** Capture POST /api/listings create bodies (publish). */
export function installListingCreateCapture(page: Page) {
  const creates: { url: string; body: Record<string, unknown>; status: number }[] = [];
  void page.route("**/api/listings", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.continue();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = req.postDataJSON() as Record<string, unknown>;
    } catch {
      body = {};
    }
    const image = typeof body.image === "string" ? body.image : "";
    const images = Array.isArray(body.images) ? body.images : [];
    const hasImage =
      (image && image.trim().length > 0) ||
      images.some((u) => String(u ?? "").trim().length > 0);
    if (!hasImage) {
      creates.push({ url: req.url(), body, status: 400 });
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "image is required" }),
      });
      return;
    }
    creates.push({ url: req.url(), body, status: 200 });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: String(body.id ?? `e2e-created-${creates.length}`),
        ...body,
        status: "active",
        sellerId: E2E_SELLER_ID,
        createdAt: new Date().toISOString(),
      }),
    });
  });
  return creates;
}

export async function installShippingLockerMocks(page: Page) {
  await page.route("**/api/shipping/lockers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "omniva",
        live: false,
        lockers: [
          {
            id: "OMNIVA-VNO-001",
            name: "Vilnius PC CUP",
            city: "Vilnius",
            address: "Upės g. 9",
            zip: "09310",
          },
        ],
      }),
    });
  });
}

export async function installBillingConfirmMock(
  page: Page,
  listing: E2EListing
) {
  await page.route("**/api/billing/confirm**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        message: "Skelbimo iškėlimas aktyvuotas!",
        listing: {
          ...listing,
          promoted: true,
          visibilityTier: "plus",
          visibilityExpiresAt: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          attributes: {
            ...listing.attributes,
            visibilityTier: "2",
          },
        },
        invoice: {
          id: "e2e-stripe-inv",
          number: "VAUTO-E2E-STRIPE-1",
          amountGross: 5,
        },
      }),
    });
  });
  await page.route("**/api/billing/webhook**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: true }),
    });
  });
}

export function tinyPngPath() {
  return path.join(process.cwd(), "public", "listing-placeholder.svg");
}
