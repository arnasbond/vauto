const CACHE = "vauto-shell-v5";
const PRECACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

/** @type {{ listings: object[]; savedQueries: string[]; seenIds: Set<string> }} */
const alertState = {
  listings: [],
  savedQueries: [],
  seenIds: new Set(),
};

function tokenize(query) {
  return query
    .toLowerCase()
    .split(/[\s,.;:!?—–-]+/)
    .filter((t) => t.length >= 3);
}

function listingMatchesQuery(listing, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return false;
  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    ...(listing.tags || []),
    listing.description || "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

function findBackgroundAlert() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const query of alertState.savedQueries) {
    const match = alertState.listings
      .filter(
        (l) =>
          !alertState.seenIds.has(l.id) &&
          l.status !== "sold" &&
          !l.banned &&
          new Date(l.createdAt).getTime() >= dayAgo &&
          listingMatchesQuery(l, query) &&
          (l.score ?? 0) >= 0
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    if (match) {
      alertState.seenIds.add(match.id);
      return {
        title: "VAUTO: pageidavimas įvykdytas!",
        body: `${match.title} — ${match.location}. Atitinka „${query}". Spauskite — atidarysite prekę.`,
        url: `/listing/${match.slug || match.id}/`,
        listingId: match.id,
        voiceText: `Sveiki! Radau naują skelbimą: ${match.title} ${match.location}.`,
      };
    }
  }
  return null;
}

async function simulateBackgroundFetchCheck() {
  const payload = findBackgroundAlert();
  if (!payload) return;
  console.info("[VAUTO SW] background alert match", payload.listingId);
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `vauto-sw-alert-${payload.listingId}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 300],
    data: payload,
  });
}

/** Next.js static export RSC payloads — never show as a full page. */
function htmlUrlForRscPath(pathname) {
  if (pathname.endsWith("/index.txt")) {
    return pathname.slice(0, -"index.txt".length);
  }
  if (pathname.endsWith(".txt")) {
    return `${pathname.slice(0, -4)}/`;
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const rscHtmlPath = htmlUrlForRscPath(url.pathname);
  if (event.request.mode === "navigate" && rscHtmlPath) {
    event.respondWith(Response.redirect(new URL(rscHtmlPath, url.origin), 302));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
        return (
          (await caches.match(`${path}index.html`)) ||
          (await caches.match("/")) ||
          fetch(event.request)
        );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok || response.type === "opaque") return response;
        const copy = response.clone();
        if (
          url.pathname.startsWith("/_next/static/") ||
          url.pathname.endsWith(".html") ||
          (url.pathname.endsWith("/") && !url.pathname.endsWith(".txt"))
        ) {
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

/** Simulated background sync — client posts listing snapshots */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "VAUTO_SYNC_ALERTS") {
    alertState.listings = data.listings || [];
    alertState.savedQueries = data.savedQueries || [];
    console.info("[VAUTO SW] alerts synced", {
      listings: alertState.listings.length,
      queries: alertState.savedQueries.length,
    });
    void simulateBackgroundFetchCheck();
  }

  if (data.type === "VAUTO_SIMULATE_PUSH") {
    void self.registration.showNotification(data.title || "VAUTO", {
      body: data.body || "Naujas skelbimas atitinka jūsų paiešką.",
      icon: data.icon || "/icon-192.png",
      image: data.image,
      data: { voiceText: data.voiceText, url: data.url || "/" },
      requireInteraction: true,
      vibrate: [200, 100, 200],
    });
  }

  if (data.type === "VAUTO_CHAT_PUSH") {
    void self.registration.showNotification(data.title || "Nauja žinutė", {
      body: data.body || "",
      icon: data.icon || "/icon-192.png",
      image: data.image,
      badge: "/icon-192.png",
      tag: data.tag || "vauto-chat",
      renotify: true,
      vibrate: [120, 60, 120],
      data: {
        type: "VAUTO_CHAT_MESSAGE",
        url: data.url,
        chatId: data.chatId,
        listingId: data.listingId,
      },
    });
  }
});

/** High-priority push when app is closed (simulated via web push payload) */
self.addEventListener("push", (event) => {
  let payload = {
    title: "VAUTO: naujas skelbimas!",
    body: "Radome skelbimą, atitinkantį jūsų paiešką.",
    url: "/",
    voiceText: "Sveiki! Radau naują skelbimą, kuris jums gali tikti.",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    /* default payload */
  }

  console.info("[VAUTO SW] push received", payload.title);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icon-192.png",
      image: payload.image,
      badge: "/icon-192.png",
      tag: payload.tag || "vauto-push-alert",
      renotify: true,
      requireInteraction: payload.type === "VAUTO_CHAT_MESSAGE" ? false : true,
      vibrate: [300, 100, 300],
      data: payload,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url =
    data.url ||
    (data.chatId ? `/pokalbiai/?id=${encodeURIComponent(data.chatId)}` : "/");

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: data.type === "VAUTO_CHAT_MESSAGE" ? "VAUTO_NAVIGATE" : "VAUTO_PLAY_VOICE",
            voiceText: data.voiceText,
            url,
          });
          if ("focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              client.navigate(url);
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
