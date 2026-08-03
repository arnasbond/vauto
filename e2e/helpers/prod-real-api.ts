/**
 * Live production API helpers — real HTTP only. Never stub or fulfill routes.
 */
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PROD_API = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

/** Demo bypass phones accepted by live Render OTP when VAUTO_ALLOW_DEMO_OTP=true. */
export const BUYER_PHONE = process.env.VAUTO_SMOKE_PHONE ?? "+37060000001";
export const SELLER_PHONE = process.env.VAUTO_PRO_PHONE ?? "+37060000002";
export const DEMO_OTP = process.env.VAUTO_DEMO_OTP ?? "123456";

/** Non-stock avatar — must NOT match STOCK_AVATAR_URLS in profile-identity.ts */
export const REAL_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&q=80";

export const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&h=600&fit=crop";

/** Ensure nickname + avatar on live user so identity gate does not block UI. */
export async function ensureLiveProfileComplete(
  request: APIRequestContext,
  session: LiveSession,
  nickname = `E2E${session.userId.slice(-4)}`
): Promise<LiveSession> {
  const started = Date.now();
  const profile = await apiJson(request, "/api/user/profile", {
    method: "PUT",
    data: { nickname, firstName: "E2E", lastName: "Tester" },
    token: session.token,
    userId: session.userId,
  });
  expect(
    profile.status,
    `PUT /api/user/profile failed: ${JSON.stringify(profile.body)}`
  ).toBeLessThan(400);

  const avatar = await apiJson(request, `/api/users/${session.userId}/avatar`, {
    method: "PATCH",
    data: { avatar: REAL_AVATAR },
    token: session.token,
    userId: session.userId,
  });
  expect(
    avatar.status,
    `PATCH avatar failed: ${JSON.stringify(avatar.body)}`
  ).toBeLessThan(400);

  markLatency("ensure_profile", started, true, nickname);
  return { ...session, name: nickname };
}

export type LiveSession = {
  token: string;
  userId: string;
  phone: string;
  name?: string;
  role?: string;
  profileType?: string;
};

export type LatencyMark = {
  name: string;
  ms: number;
  ok: boolean;
  detail?: string;
};

export const latencyLog: LatencyMark[] = [];

export function markLatency(
  name: string,
  startedAt: number,
  ok: boolean,
  detail?: string
): number {
  const ms = Date.now() - startedAt;
  latencyLog.push({ name, ms, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`[latency] ${name}: ${ms}ms ok=${ok}${detail ? ` (${detail})` : ""}`);
  return ms;
}

export async function apiJson<T = unknown>(
  request: APIRequestContext,
  path: string,
  opts: {
    method?: string;
    data?: unknown;
    token?: string;
    userId?: string;
    timeout?: number;
  } = {}
): Promise<{ status: number; body: T; ms: number }> {
  const started = Date.now();
  const res = await request.fetch(`${PROD_API}${path}`, {
    method: opts.method ?? (opts.data ? "POST" : "GET"),
    data: opts.data,
    timeout: opts.timeout ?? 120_000,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token
        ? {
            Authorization: `Bearer ${opts.token}`,
            ...(opts.userId ? { "X-User-Id": opts.userId } : {}),
          }
        : {}),
    },
  });
  const ms = Date.now() - started;
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status(), body, ms };
}

/** Real OTP send+verify against production API. */
export async function liveOtpLogin(
  request: APIRequestContext,
  phone: string,
  opts?: { role?: string; city?: string; profileType?: string }
): Promise<LiveSession> {
  const started = Date.now();
  const send = await apiJson(request, "/api/auth/otp/send", {
    method: "POST",
    data: { phone },
  });
  expect(send.status, `OTP send failed for ${phone}: ${JSON.stringify(send.body)}`).toBeLessThan(
    400
  );

  const verify = await apiJson<{
    token?: string;
    user?: {
      id: string;
      name?: string;
      role?: string;
      profileType?: string;
      phone?: string;
    };
  }>(request, "/api/auth/otp/verify", {
    method: "POST",
    data: {
      phone,
      code: DEMO_OTP,
      role: opts?.role ?? "private",
      city: opts?.city ?? "Vilnius",
      ...(opts?.profileType ? { profileType: opts.profileType } : {}),
    },
  });
  expect(
    verify.status,
    `OTP verify failed for ${phone}: ${JSON.stringify(verify.body)}`
  ).toBe(200);
  expect(verify.body.token, "missing access token").toBeTruthy();
  expect(verify.body.user?.id, "missing user id").toBeTruthy();

  markLatency(`otp_login:${phone}`, started, true, verify.body.user?.id);

  return {
    token: verify.body.token!,
    userId: verify.body.user!.id,
    phone,
    name: verify.body.user?.name,
    role: verify.body.user?.role,
    profileType: verify.body.user?.profileType,
  };
}

/**
 * Inject a REAL JWT from live OTP into the browser — no e2e-* fake tokens,
 * no route stubs. AuthContext will validate via live /api/auth/session.
 */
export async function injectLiveSession(page: Page, session: LiveSession) {
  await page.addInitScript(
    ({ session: s }) => {
      const auth = {
        isAuthenticated: true,
        provider: "phone",
        loggedInAt: new Date().toISOString(),
        accessToken: s.token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const nick = s.name || "E2EProd";
      const user = {
        id: s.userId,
        name: nick,
        nickname: nick,
        phone: s.phone,
        city: "Vilnius",
        avatar:
          "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&q=80",
        role: s.role || "private",
        profileType: s.profileType || "private",
        walletBalance: 0,
      };
      localStorage.setItem("vauto_auth_v1", JSON.stringify(auth));
      localStorage.setItem("vauto_user_v1", JSON.stringify(user));
      localStorage.setItem("vauto_access_token_v1", s.token);
      localStorage.setItem("vauto_gdpr_consent_v1", "true");
      localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
    },
    { session }
  );
}

/**
 * Fail hard if Playwright route mocks / fulfills are present.
 * Production E2E must hit real network only.
 */
export async function assertNoRouteMocks(page: Page) {
  const mocked = await page.evaluate(() => {
    const w = window as unknown as {
      __VAUTO_E2E_MOCKS__?: unknown;
      __PLAYWRIGHT_ROUTE_MOCKS__?: unknown;
    };
    return Boolean(w.__VAUTO_E2E_MOCKS__ || w.__PLAYWRIGHT_ROUTE_MOCKS__);
  });
  expect(mocked, "route mocks detected — prod-real suite forbids stubs").toBe(false);

  // Ensure API calls leave the browser (no service-worker offline stub)
  const probe = await page.request.get(`${PROD_API}/api/health`, { timeout: 60_000 });
  expect(probe.ok(), "live API health unreachable from browser context").toBeTruthy();
}

export type ListingRow = {
  id: string;
  title: string;
  category: string;
  price: number;
  sellerId?: string;
  status?: string;
};

export async function fetchPublicListings(
  request: APIRequestContext,
  limit = 100
): Promise<ListingRow[]> {
  const started = Date.now();
  const res = await apiJson<ListingRow[]>(request, `/api/listings?limit=${limit}`);
  expect(res.status, `GET /api/listings failed: ${JSON.stringify(res.body)}`).toBe(200);
  expect(Array.isArray(res.body), "listings must be an array").toBe(true);
  markLatency("GET /api/listings", started, true, `count=${res.body.length}`);
  return res.body;
}

export function countMatches(
  listings: ListingRow[],
  kind: "stalas" | "paslaugos" | "automobilis"
): ListingRow[] {
  if (kind === "stalas") {
    return listings.filter((l) => /stal/i.test(l.title) || /stal/i.test(l.category));
  }
  if (kind === "paslaugos") {
    return listings.filter((l) => l.category === "services");
  }
  return listings.filter((l) => l.category === "vehicles");
}

export async function createLiveListing(
  request: APIRequestContext,
  session: LiveSession,
  input: {
    title: string;
    category: string;
    price: number;
    description?: string;
  }
): Promise<ListingRow> {
  const started = Date.now();
  const id = `l-prod-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const payload = {
    id,
    title: input.title,
    price: input.price,
    location: "Vilnius",
    distanceKm: 1,
    slug: `${input.title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    image: SAMPLE_IMAGE,
    images: [SAMPLE_IMAGE],
    category: input.category,
    tags: ["prod-e2e", input.category],
    sellerId: session.userId,
    createdAt: now,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    description:
      input.description ??
      `Prod E2E listing ${input.title} — real HTTP create with photo URL.`,
    status: "active",
    contact: session.phone,
    allowPastomatas: false,
  };

  const res = await apiJson<ListingRow>(request, "/api/listings", {
    method: "POST",
    data: payload,
    token: session.token,
    userId: session.userId,
    timeout: 120_000,
  });
  // Some gateways wrap; accept 200/201
  expect(
    res.status,
    `POST /api/listings failed: ${JSON.stringify(res.body)}`
  ).toBeLessThan(400);
  const createdId = (res.body as { id?: string }).id || id;
  markLatency("POST /api/listings", started, true, createdId);
  return { ...payload, id: createdId, sellerId: session.userId };
}

export async function deleteLiveListing(
  request: APIRequestContext,
  session: LiveSession,
  listingId: string
) {
  const res = await apiJson(request, `/api/listings/${listingId}`, {
    method: "DELETE",
    token: session.token,
    userId: session.userId,
  });
  expect(res.status, `DELETE listing ${listingId}: ${JSON.stringify(res.body)}`).toBeLessThan(
    500
  );
}

export async function createListingBoundChat(
  request: APIRequestContext,
  buyer: LiveSession,
  seller: LiveSession,
  listingId: string,
  listingTitle: string
): Promise<{ threadId: string; ms: number }> {
  const started = Date.now();
  const enc = (v: string) =>
    encodeURIComponent(String(v ?? "").trim()).replace(/%/g, ".");
  const threadId = `chat_${enc(buyer.userId)}__${enc(seller.userId)}__${enc(listingId)}`;
  const thread = {
    id: threadId,
    listingId,
    listingTitle,
    buyerId: buyer.userId,
    sellerId: seller.userId,
    escrowOffered: false,
    messages: [
      {
        id: `m-${Date.now()}`,
        senderId: buyer.userId,
        text: `Prod E2E: domina „${listingTitle}" — ar dar aktualu?`,
        timestamp: new Date().toISOString(),
      },
    ],
  };
  const res = await apiJson(request, "/api/chats", {
    method: "PUT",
    data: thread,
    token: buyer.token,
    userId: buyer.userId,
  });
  expect(res.status, `PUT /api/chats failed: ${JSON.stringify(res.body)}`).toBeLessThan(400);

  // Seller reply with seller token (true two-party write)
  const withReply = {
    ...thread,
    messages: [
      ...thread.messages,
      {
        id: `m-${Date.now()}-2`,
        senderId: seller.userId,
        text: "Taip, skelbimas aktualus. Galime tartis.",
        timestamp: new Date().toISOString(),
      },
    ],
  };
  const reply = await apiJson(request, "/api/chats", {
    method: "PUT",
    data: withReply,
    token: seller.token,
    userId: seller.userId,
  });
  expect(reply.status, `chat reply failed: ${JSON.stringify(reply.body)}`).toBeLessThan(400);

  const ms = markLatency("chat_roundtrip_listing_bound", started, true, threadId);
  return { threadId, ms };
}

export async function fetchBuyerChats(
  request: APIRequestContext,
  buyer: LiveSession
): Promise<Array<{ id: string; listingId?: string; messages?: unknown[] }>> {
  const res = await apiJson<Array<{ id: string; listingId?: string; messages?: unknown[] }>>(
    request,
    `/api/chats/${buyer.userId}`,
    { token: buyer.token, userId: buyer.userId }
  );
  expect(res.status, `GET chats failed: ${JSON.stringify(res.body)}`).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  return res.body;
}

/** Direct live agent search — authoritative listingIds (no mocks). */
export async function liveAgentSearch(
  request: APIRequestContext,
  session: LiveSession,
  query: string
): Promise<{
  count: number;
  listingIds: string[];
  ms: number;
  reply?: string;
  actionType?: string;
}> {
  const started = Date.now();
  const res = await request.fetch(`${PROD_API}/api/vauto-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      "X-User-Id": session.userId,
    },
    data: {
      messages: [{ role: "user", text: query }],
      context: {
        userId: session.userId,
        lastUserQuery: query,
        fromSearchBar: true,
        currentView: "home",
      },
    },
    timeout: 180_000,
  });
  const ms = Date.now() - started;
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    reply?: string;
    actions?: { type?: string; listingIds?: string[]; searchQuery?: string };
    error?: string;
  };
  expect(res.ok(), `vauto-agent search failed: ${JSON.stringify(body)}`).toBeTruthy();
  const actionType = body.actions?.type ?? "none";
  // Lead-capture / none on an explicit search-bar query = production search regression
  expect(
    actionType,
    `Agent "${query}" returned non-search action=${actionType} reply=${(body.reply ?? "").slice(0, 160)}`
  ).toMatch(/^(search|empty_search|browse_all|apply_ui_filters)$/);
  const ids = Array.isArray(body.actions?.listingIds) ? body.actions!.listingIds! : [];
  const count = ids.length;
  markLatency(
    `agent_search:${query}`,
    started,
    count > 0 || actionType === "empty_search",
    `count=${count} type=${actionType}`
  );
  return { count, listingIds: ids, ms, reply: body.reply, actionType };
}
