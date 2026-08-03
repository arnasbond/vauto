import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  buildChatThread,
  E2E_BUYER_ID,
  E2E_SELLER_ID,
  type E2EChatThread,
} from "./fixtures";
import { forceOfflineCatalog, seedBuyerSession, seedDemoUser } from "./seed";

/**
 * Shared in-memory chat bus for dual-browser-context E2E.
 * Mimics WebSocket/SSE delivery: buyer PUT updates store; seller GET poll +
 * BroadcastChannel event delivers without full page reload.
 */
export class EnterpriseChatBus {
  thread: E2EChatThread;

  constructor(seed: E2EChatThread = buildChatThread()) {
    this.thread = structuredClone(seed);
  }

  async installOn(page: Page) {
    const bus = this;
    await page.route("**/api/chats**", async (route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();

      if (method === "GET" && url.includes("/stream")) {
        // Keep SSE idle — delivery is via BroadcastChannel in this suite.
        await route.fulfill({
          status: 204,
          body: "",
        });
        return;
      }

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([bus.thread]),
        });
        return;
      }

      if (method === "PUT" || method === "POST" || method === "PATCH") {
        let body: Partial<E2EChatThread> & {
          messages?: E2EChatThread["messages"];
          text?: string;
          message?: string;
        } = {};
        try {
          body = req.postDataJSON() as typeof body;
        } catch {
          body = {};
        }

        if (Array.isArray(body.messages) && body.messages.length) {
          bus.thread = {
            ...bus.thread,
            ...body,
            messages: body.messages,
          };
        } else if (typeof body.text === "string" || typeof body.message === "string") {
          const text = String(body.text ?? body.message);
          bus.thread.messages = [
            ...bus.thread.messages,
            {
              id: `e2e-msg-${Date.now()}`,
              senderId: E2E_BUYER_ID,
              text,
              createdAt: new Date().toISOString(),
              status: "sent",
            },
          ];
        } else if (body.id || body.listingId) {
          bus.thread = { ...bus.thread, ...body } as E2EChatThread;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(bus.thread),
        });
        return;
      }

      await route.continue();
    });
  }

  /** Push CHAT_UPSERT into a page without reload (BroadcastChannel). */
  async pushRealtimeTo(page: Page) {
    const thread = this.thread;
    await page.evaluate((t) => {
      const ch = new BroadcastChannel("vauto-chat-realtime-v1");
      ch.postMessage({ type: "CHAT_UPSERT", thread: t });
      ch.close();
    }, thread);
  }
}

export async function openSellerChatContext(
  browser: Browser,
  bus: EnterpriseChatBus
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
  });
  const page = await context.newPage();
  await forceOfflineCatalog(page);
  await seedDemoUser(page);
  await page.addInitScript(
    ({ thread, uid }) => {
      localStorage.setItem("vauto_active_user_id_v1", uid);
      localStorage.setItem(`vauto_chats_v1__${uid}`, JSON.stringify([thread]));
      localStorage.setItem("vauto_chats_v1", JSON.stringify([thread]));
    },
    { thread: bus.thread, uid: E2E_SELLER_ID }
  );
  await bus.installOn(page);
  return { context, page };
}

export async function openBuyerChatContext(
  browser: Browser,
  bus: EnterpriseChatBus
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
  });
  const page = await context.newPage();
  await forceOfflineCatalog(page);
  await seedBuyerSession(page);
  await page.addInitScript(
    ({ thread, uid }) => {
      localStorage.setItem("vauto_active_user_id_v1", uid);
      localStorage.setItem(`vauto_chats_v1__${uid}`, JSON.stringify([thread]));
      localStorage.setItem("vauto_chats_v1", JSON.stringify([thread]));
    },
    { thread: bus.thread, uid: E2E_BUYER_ID }
  );
  await bus.installOn(page);
  return { context, page };
}
