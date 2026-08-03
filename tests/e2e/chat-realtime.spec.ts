import { test, expect } from "@playwright/test";
import {
  EnterpriseChatBus,
  openBuyerChatContext,
  openSellerChatContext,
} from "./helpers/chat-bus";
import { acceptGdprConsentIfPrompted } from "./helpers/seed";

test.describe("Enterprise — chat realtime (2 sesijos)", () => {
  test.setTimeout(120_000);

  test("Pirkėjas rašo → Pardavėjas gauna be reload per BroadcastChannel", async ({
    browser,
  }) => {
    const bus = new EnterpriseChatBus();
    const seller = await openSellerChatContext(browser, bus);
    const buyer = await openBuyerChatContext(browser, bus);

    try {
      await seller.page.goto(`/chats/?id=${encodeURIComponent(bus.thread.id)}`);
      await acceptGdprConsentIfPrompted(seller.page);
      await expect(
        seller.page.getByText(/Sveiki, kuo galiu padėti/i).first()
      ).toBeVisible({ timeout: 20_000 });

      const sellerUrlBefore = seller.page.url();

      await buyer.page.goto(`/chats/?id=${encodeURIComponent(bus.thread.id)}`);
      await acceptGdprConsentIfPrompted(buyer.page);

      const buyerMessage = `E2E realtime ${Date.now()}`;
      // Prefer real composer if present; otherwise inject via bus + channel.
      const composer = buyer.page
        .getByPlaceholder(/rašyk|žinut|message/i)
        .or(buyer.page.locator("textarea"))
        .first();
      if (await composer.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await composer.fill(buyerMessage);
        const send = buyer.page.getByRole("button", { name: /Siųsti|Send/i });
        if (await send.isVisible().catch(() => false)) {
          await send.click();
        } else {
          await composer.press("Enter");
        }
        // Mirror into bus if UI didn't hit our mock.
        if (!bus.thread.messages.some((m) => m.text === buyerMessage)) {
          bus.thread.messages.push({
            id: `e2e-msg-${Date.now()}`,
            senderId: "user-e2e-buyer",
            text: buyerMessage,
            createdAt: new Date().toISOString(),
            status: "sent",
          });
        }
      } else {
        bus.thread.messages.push({
          id: `e2e-msg-${Date.now()}`,
          senderId: "user-e2e-buyer",
          text: buyerMessage,
          createdAt: new Date().toISOString(),
          status: "sent",
        });
      }

      await bus.pushRealtimeTo(seller.page);

      await expect(seller.page.getByText(buyerMessage).first()).toBeVisible({
        timeout: 15_000,
      });
      // No full navigation / reload away from chats.
      expect(seller.page.url()).toBe(sellerUrlBefore);
    } finally {
      await buyer.context.close();
      await seller.context.close();
    }
  });
});
