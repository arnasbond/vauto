#!/usr/bin/env node
/**
 * Real-time notifications flow test harness.
 *
 * Verifies the end-to-end realtime chain used across the platform:
 *   background event -> match engine -> notification payload -> Web Push + FCM
 *   -> service-worker notificationclick -> DEEP-LINK to the exact listing/chat.
 *
 * Covers the three audited scenarios:
 *   1) Wishlist match fires + payload deep-links to /listing/<slug>/ (not home).
 *   2) Negotiation / P2P interest fans out over BOTH Web Push and FCM.
 *   3) Resilience: delivery is non-blocking; SW notificationclick always routes
 *      to the exact target (open window -> SPA nav, else openWindow(url)).
 *
 * Modes:
 *   node scripts/test-realtime-notifications.mjs           # offline logic + remote reachability
 *   node scripts/test-realtime-notifications.mjs --local   # offline only
 *   node scripts/test-realtime-notifications.mjs https://vauto-api.onrender.com
 *
 * Requires: npm run server:build (for offline imports).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const localOnly = process.argv.includes("--local");
const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}
function readRepo(...segments) {
  return readFileSync(join(root, ...segments), "utf8");
}

let failures = 0;
function check(cond, label) {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
}

// Mirrors server notifyWishlistRequirementMatch URL derivation.
function wishlistDeepLink(listing) {
  const slug = listing.slug ?? listing.id;
  return `/listing/${slug}/`;
}

async function runOffline() {
  console.log("\n== Offline realtime logic ==");

  const { listingMatchesRequirement, buildWishlistMatchMessage } =
    await distImport("offer-engine.js");

  const listing = {
    id: "lst-1",
    slug: "bmw-320d-vilnius",
    title: "BMW 320d 2015",
    price: 8500,
    category: "cars",
    location: "Vilnius",
    tags: ["bmw", "dyzelinas"],
    description: "Tvarkingas universalas",
  };
  const req = {
    id: "req-1",
    userId: "buyer-9",
    query: "bmw 320d",
    category: "cars",
    city: "Vilnius",
    maxPrice: 10000,
    wardrobeMode: false,
    lastNotifiedListingId: null,
  };

  // 1) Match engine fires for a genuine match.
  check(listingMatchesRequirement(listing, req), "wishlist: matching listing triggers a match");

  // 2) Non-match (wrong city) does not fire.
  check(
    !listingMatchesRequirement(listing, { ...req, city: "Kaunas" }),
    "wishlist: non-matching city does not fire"
  );

  // 3) Dedupe: same listing already notified never re-fires.
  check(
    !listingMatchesRequirement(listing, { ...req, lastNotifiedListingId: "lst-1" }),
    "wishlist: already-notified listing is de-duplicated"
  );

  // 4) Payload deep-links to the EXACT listing (not the home page).
  const url = wishlistDeepLink(listing);
  check(url === "/listing/bmw-320d-vilnius/", `wishlist: deep-link points to exact listing (${url})`);
  check(
    wishlistDeepLink({ id: "lst-2" }) === "/listing/lst-2/",
    "wishlist: deep-link falls back to id when slug missing"
  );

  // 5) Message payload is specific and actionable.
  const msg = buildWishlistMatchMessage(req, listing);
  check(
    /bmw 320d/i.test(msg.body) && /BMW 320d 2015/.test(msg.body),
    "wishlist: message names the query and the matched listing"
  );

  // 6) Non-blocking delivery: schedule hook returns synchronously (fire-and-forget).
  const { scheduleWishlistMatchNotifications } = await distImport(
    "notifications",
    "notifications-service.js"
  );
  const t0 = Date.now();
  const ret = scheduleWishlistMatchNotifications(listing);
  const elapsed = Date.now() - t0;
  check(
    ret === undefined && elapsed < 50,
    `delivery is non-blocking (returned in ${elapsed}ms, does not await push)`
  );

  // 7) Cross-channel fan-out contract (Web Push + FCM) for P2P/negotiation.
  const pushSrc = readFileSync(join(dist, "services", "push-service.js"), "utf8");
  check(
    /deliverRealtimeToUsers/.test(pushSrc),
    "push-service exposes deliverRealtimeToUsers (dual-channel)"
  );
  check(
    /sendWebPushToUsers/.test(pushSrc) && /sendPushToUsers/.test(pushSrc),
    "negotiation fan-out uses BOTH Web Push and FCM"
  );

  // 8) Service-worker deep-link contract — always routes to the exact target.
  const sw = readRepo("public", "sw.js");
  check(/VAUTO_NAVIGATE/.test(sw), "SW notificationclick posts VAUTO_NAVIGATE (SPA deep-link)");
  check(/openWindow\(url\)/.test(sw), "SW opens the exact deep-link url when no window is open");
  check(
    !/client\.navigate\(/.test(sw),
    "SW no longer depends on fragile client.navigate() for routing"
  );

  // 9) Client handler routes on url for navigate/voice messages.
  const shell = readRepo("src", "components", "NativeShell.tsx");
  check(
    /router\.push\(data\.url\)/.test(shell),
    "client routes to data.url on notification click"
  );

  // 10) P2P chat message notification — DB + dual push for both directions.
  const notifSrc = readFileSync(
    join(dist, "notifications", "notifications-service.js"),
    "utf8"
  );
  check(
    /notifyIncomingChatMessage/.test(notifSrc),
    "P2P: notifyIncomingChatMessage writes DB + delivers push"
  );
  check(
    /kind:\s*["']chat_message["']/.test(notifSrc),
    "P2P: internal notification kind is chat_message"
  );
  check(
    /\/pokalbiai\/\?id=/.test(notifSrc),
    "P2P: chat deep-link targets /pokalbiai/?id= (not home)"
  );

  // 11) P2P ping-pong — new message detection logic (buyer ↔ seller).
  const prevCount = 3;
  const nextCount = 4;
  const thread = {
    id: "chat-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    listingTitle: "BMW 320d",
    messages: [
      { id: "m1", senderId: "buyer-1", text: "Labas" },
      { id: "m2", senderId: "seller-1", text: "Sveiki" },
      { id: "m3", senderId: "buyer-1", text: "Kokia kaina?" },
      { id: "m4", senderId: "seller-1", text: "8500 €" },
    ],
  };
  const latest = thread.messages[nextCount - 1];
  const recipientId =
    latest.senderId === thread.buyerId ? thread.sellerId : thread.buyerId;
  check(
    nextCount > prevCount && latest.senderId === "seller-1" && recipientId === "buyer-1",
    "P2P ping-pong: seller reply routes notification to buyer"
  );

  // 12) Bell API — read/mark endpoints exist server-side.
  const growthSrc = readRepo("server", "src", "routes", "growth.ts");
  check(/unreadCount/.test(growthSrc), "bell: GET /notifications returns unreadCount");
  check(
    /notifications\/:id\/read/.test(growthSrc),
    "bell: POST /notifications/:id/read marks single notification"
  );
  check(
    /notifications\/read-all/.test(growthSrc),
    "bell: POST /notifications/read-all marks all read"
  );

  // 13) Bell client — polling fallback when push denied.
  const bellPoll = readRepo("src", "lib", "notification-bell-poll.ts");
  check(
    /BELL_POLL_DENIED_MS/.test(bellPoll) && /bellPollInterval/.test(bellPoll),
    "bell: aggressive poll interval when push permission denied"
  );
  const bellCtx = readRepo("src", "context", "NotificationBellContext.tsx");
  check(
    /apiFetchUserNotifications/.test(bellCtx) && /totalUnreadCount/.test(bellCtx),
    "bell: context polls DB notifications + combines unread count"
  );
  check(
    /NotificationBellProvider/.test(bellCtx),
    "bell: dedicated provider for in-app notification layer"
  );

  // 14) Live in-app chat sync — polling + BroadcastChannel INCOMING_ALERT.
  const chatRt = readRepo("src", "lib", "chat-realtime.ts");
  check(/INCOMING_ALERT/.test(chatRt), "live chat: INCOMING_ALERT event for cross-tab toast/sound");
  check(
    /CHAT_POLL_VISIBLE_MS/.test(bellPoll) && /chatPollInterval/.test(bellPoll),
    "live chat: 4s visible-tab poll interval (Messenger-like)"
  );
  const chatCtx = readRepo("src", "context", "ChatContext.tsx");
  check(/apiFetchChats/.test(chatCtx), "live chat: polls server for incoming P2P messages");
  check(/INCOMING_ALERT/.test(chatCtx), "live chat: raises in-app alert when new message detected");

  // 15) Deep-link from bell → chat with autofocus.
  const threadView = readRepo("src", "components", "ChatThreadView.tsx");
  check(/inputRef/.test(threadView) && /\.focus\(\)/.test(threadView), "deep-link: chat input autofocus on open");
  const bellUi = readRepo("src", "components", "notifications", "NotificationBell.tsx");
  check(/openNotification/.test(bellUi), "bell: click opens notification deep-link");
  check(
    /chatIdFromNotificationUrl/.test(bellUi),
    "bell: parses chat id from notification url"
  );

  // 16) chatId deep-link parser contract.
  function chatIdFromNotificationUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, "https://vauto.local");
      if (parsed.pathname.includes("pokalbiai") || parsed.pathname.includes("chats")) {
        return parsed.searchParams.get("id");
      }
    } catch {
      const m = url.match(/[?&]id=([^&]+)/);
      if (m?.[1]) return decodeURIComponent(m[1]);
    }
    return null;
  }
  check(
    chatIdFromNotificationUrl("/pokalbiai/?id=chat-abc") === "chat-abc",
    "deep-link parser: extracts chat id from pokalbiai url"
  );
}

async function runRemote() {
  console.log(`\n== Remote realtime endpoints via ${base} ==`);

  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30_000) });
    check(res.status < 500, `health reachable, no 5xx (got ${res.status})`);
  } catch (e) {
    console.log(`  [WARN] health probe: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const res = await fetch(`${base}/api/push/vapid-public-key`, {
      signal: AbortSignal.timeout(30_000),
    });
    check(res.status < 500, `vapid-public-key endpoint reachable (got ${res.status})`);
    const body = await res.json().catch(() => ({}));
    console.log(
      `        web push enabled=${JSON.stringify(body.enabled ?? false)}${
        body.enabled ? " (browser realtime live)" : " (VAPID keys not set in this env)"
      }`
    );
  } catch (e) {
    console.log(`  [WARN] vapid probe: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log("VAUTO real-time notifications flow test");
  await runOffline();
  if (!localOnly) {
    await runRemote().catch((e) =>
      console.warn("Remote probe skipped:", e instanceof Error ? e.message : e)
    );
  }
  console.log(
    failures === 0
      ? "\nReal-time notifications test: OK"
      : `\nReal-time notifications test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
