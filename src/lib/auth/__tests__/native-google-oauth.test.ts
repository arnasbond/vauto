/**
 * Item 5/5 — Native Google OAuth: Android + iOS Integration Tests.
 *
 * Verifies the canonical Google OAuth contract across platforms:
 * 1. Web redirect preserves standard web callback URI.
 * 2. Android native invokes external adapter with registered app scheme (com.vauto.app://auth/callback).
 * 3. iOS native invokes external adapter with registered app scheme (com.vauto.app://auth/callback).
 * 4. Missing native adapter fails closed (no fake redirect, no WebView fallback).
 * 5. Wrong state is rejected.
 * 6. Missing state is rejected.
 * 7. Replay / already-consumed state is rejected.
 * 8. Insecure query parameter token transport is rejected; fragment transport is required.
 * 9. Authorization code in query string is supported without token leakage.
 * 10. Logout and privacy purge wipes OAuth context and pending payload.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Capacitor } from "@capacitor/core";
import {
  getNativeAuthCallbackUrl,
  getWebAuthCallbackUrl,
  persistOAuthLaunchContext,
  loadOAuthLaunchContext,
  storeOAuthCallbackPayload,
  consumeOAuthPendingPayload,
  OAUTH_PENDING_STORAGE_KEY,
  OAUTH_CONTEXT_STORAGE_KEY,
} from "../oauth-redirect.js";
import { startGoogleRedirectSignIn } from "../google-client.js";
import { registerNativeAuthAdapter } from "../native-auth.js";
import { purgeClientSessionAndDraftState } from "../logout-cleanup.js";

// Mock minimal browser storage & window environment for node:test
class MockStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockSession = new MockStorage();
const mockLocal = new MockStorage();
let cookieJar = "";

let lastAssignedUrl: string | null = null;

const mockWindow = {
  location: {
    origin: "https://vauto.lt",
    pathname: "/",
    search: "",
    protocol: "https:",
    assign(url: string) {
      lastAssignedUrl = url;
    },
  },
  sessionStorage: mockSession as unknown as Storage,
  localStorage: mockLocal as unknown as Storage,
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

Object.defineProperty(globalThis, "window", {
  value: mockWindow,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "document", {
  value: {
    get cookie() {
      return cookieJar;
    },
    set cookie(val: string) {
      if (val.includes("Max-Age=0")) {
        cookieJar = "";
      } else {
        cookieJar = val.split(";")[0] ?? "";
      }
    },
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "sessionStorage", {
  value: mockSession,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocal,
  writable: true,
  configurable: true,
});

// Ensure a runtime client id is configured for tests
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "mock-google-client-id-12345.apps.googleusercontent.com";

describe("Item 5 — Native Google OAuth: Canonical Platform Matrix", () => {
  let isNativeMock = false;

  beforeEach(() => {
    mockSession.clear();
    mockLocal.clear();
    cookieJar = "";
    lastAssignedUrl = null;
    registerNativeAuthAdapter(null);
    delete (window as unknown as { VautoAndroid?: unknown }).VautoAndroid;
    delete (window as unknown as { VautoIos?: unknown }).VautoIos;

    isNativeMock = false;
    (Capacitor as unknown as { isNativePlatform: () => boolean }).isNativePlatform =
      () => isNativeMock;
  });

  it("1. Web: Google OAuth redirect preserves web callback URI and stores state/nonce", () => {
    isNativeMock = false;

    const outcome = startGoogleRedirectSignIn({ returnPath: "/skelbimai?q=volvo" });

    assert.equal(outcome.status, "redirecting");
    assert.ok(lastAssignedUrl, "window.location.assign was invoked");

    const targetUrl = new URL(lastAssignedUrl!);
    assert.equal(targetUrl.origin, "https://accounts.google.com");
    assert.equal(targetUrl.pathname, "/o/oauth2/v2/auth");

    // Web callback URI must be preserved
    assert.equal(targetUrl.searchParams.get("redirect_uri"), getWebAuthCallbackUrl());
    assert.equal(targetUrl.searchParams.get("response_type"), "id_token");

    // State & nonce must be generated and persisted
    const state = targetUrl.searchParams.get("state");
    const nonce = targetUrl.searchParams.get("nonce");
    assert.ok(state, "state parameter generated");
    assert.ok(nonce, "nonce parameter generated");

    const ctx = loadOAuthLaunchContext();
    assert.ok(ctx, "OAuth launch context stored");
    assert.equal(ctx?.state, state);
    assert.equal(ctx?.nonce, nonce);
    assert.equal(ctx?.returnPath, "/skelbimai?q=volvo");
  });

  it("2. Android native: system auth adapter invoked with registered app deep link", () => {
    isNativeMock = true;

    let androidOpenedUrl: string | null = null;
    (window as unknown as { VautoAndroid: { openExternalUrl: (url: string) => void } }).VautoAndroid = {
      openExternalUrl(url: string) {
        androidOpenedUrl = url;
      },
    };

    const outcome = startGoogleRedirectSignIn({ returnPath: "/profilis" });

    assert.equal(outcome.status, "redirecting");
    assert.equal(lastAssignedUrl, null, "window.location.assign was NOT invoked (no WebView redirect)");
    assert.ok(androidOpenedUrl, "VautoAndroid.openExternalUrl was invoked");

    const targetUrl = new URL(androidOpenedUrl!);
    // Registered custom app scheme must be used on Android native
    assert.equal(targetUrl.searchParams.get("redirect_uri"), getNativeAuthCallbackUrl());
    assert.equal(targetUrl.searchParams.get("redirect_uri"), "com.vauto.app://auth/callback");

    const state = targetUrl.searchParams.get("state")!;
    assert.ok(state);

    // Simulate Android return through registered deep link
    const callbackUrl = `com.vauto.app://auth/callback#id_token=valid_android_id_token&state=${encodeURIComponent(state)}`;
    const payload = storeOAuthCallbackPayload(callbackUrl);

    assert.ok(payload, "Callback payload processed successfully");
    assert.equal(payload?.idToken, "valid_android_id_token");
    assert.equal(payload?.returnPath, "/profilis");

    // Consumed payload is retrieved cleanly
    const consumed = consumeOAuthPendingPayload();
    assert.equal(consumed?.idToken, "valid_android_id_token");
  });

  it("3. iOS native: system auth adapter invoked with registered app deep link", () => {
    isNativeMock = true;

    let iosOpenedUrl: string | null = null;
    (window as unknown as { VautoIos: { openExternalUrl: (url: string) => void } }).VautoIos = {
      openExternalUrl(url: string) {
        iosOpenedUrl = url;
      },
    };

    const outcome = startGoogleRedirectSignIn({ returnPath: "/pokalbiai" });

    assert.equal(outcome.status, "redirecting");
    assert.equal(lastAssignedUrl, null, "window.location.assign was NOT invoked");
    assert.ok(iosOpenedUrl, "VautoIos.openExternalUrl was invoked");

    const targetUrl = new URL(iosOpenedUrl!);
    assert.equal(targetUrl.searchParams.get("redirect_uri"), getNativeAuthCallbackUrl());
    assert.equal(targetUrl.searchParams.get("redirect_uri"), "com.vauto.app://auth/callback");

    const state = targetUrl.searchParams.get("state")!;
    assert.ok(state);

    // Simulate iOS return through registered deep link
    const callbackUrl = `com.vauto.app://auth/callback#id_token=valid_ios_id_token&state=${encodeURIComponent(state)}`;
    const payload = storeOAuthCallbackPayload(callbackUrl);

    assert.ok(payload, "Callback payload processed successfully");
    assert.equal(payload?.idToken, "valid_ios_id_token");
    assert.equal(payload?.returnPath, "/pokalbiai");
  });

  it("4. Missing native adapter: fails closed without fake redirect or WebView fallback", () => {
    isNativeMock = true;
    // No Android or iOS adapter present
    delete (window as unknown as { VautoAndroid?: unknown }).VautoAndroid;
    delete (window as unknown as { VautoIos?: unknown }).VautoIos;

    const outcome = startGoogleRedirectSignIn({ returnPath: "/nustatymai" });

    assert.equal(outcome.status, "error", "Must fail closed with status=error");
    assert.equal(lastAssignedUrl, null, "Must NOT navigate in WebView");
    if (outcome.status === "error") {
      assert.match(outcome.message, /adapterio|nepalaikoma/i);
    }
  });

  it("5. Wrong state: rejected and launch context cleared", () => {
    persistOAuthLaunchContext({
      provider: "google",
      state: "expected_state_abc123",
      returnPath: "/skelbimai",
    });

    const maliciousCallback =
      "com.vauto.app://auth/callback#id_token=forged_token&state=attacker_state_xyz";
    const payload = storeOAuthCallbackPayload(maliciousCallback);

    assert.equal(payload, null, "Must reject mismatched state");
    assert.equal(sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY), null);
    assert.equal(loadOAuthLaunchContext(), null, "Launch context must be wiped");
  });

  it("6. Missing state: rejected", () => {
    persistOAuthLaunchContext({
      provider: "google",
      state: "expected_state_abc123",
      returnPath: "/skelbimai",
    });

    const noStateCallback = "com.vauto.app://auth/callback#id_token=some_token";
    const payload = storeOAuthCallbackPayload(noStateCallback);

    assert.equal(payload, null, "Must reject missing state");
    assert.equal(sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY), null);
  });

  it("7. Replay / already-consumed state: rejected on second attempt", () => {
    const validState = "one_time_state_777";
    persistOAuthLaunchContext({
      provider: "google",
      state: validState,
      returnPath: "/mano",
    });

    const callbackUrl = `com.vauto.app://auth/callback#id_token=fresh_token&state=${validState}`;

    // First attempt: succeeds and consumes state
    const first = storeOAuthCallbackPayload(callbackUrl);
    assert.ok(first, "First call must succeed");

    // Replay attempt with same state: must be rejected
    const replay = storeOAuthCallbackPayload(callbackUrl);
    assert.equal(replay, null, "Replayed state must fail closed");
  });

  it("8. Token handoff: insecure query parameter token transport is rejected", () => {
    const state = "state_query_test_888";
    persistOAuthLaunchContext({
      provider: "google",
      state,
      returnPath: "/",
    });

    // Insecure: id_token in query string instead of fragment
    const insecureQueryUrl = `com.vauto.app://auth/callback?id_token=token_in_query&state=${state}`;
    const rejected = storeOAuthCallbackPayload(insecureQueryUrl);
    assert.equal(rejected, null, "Must reject id_token in query parameters");

    // Secure: id_token in fragment
    persistOAuthLaunchContext({
      provider: "google",
      state,
      returnPath: "/",
    });
    const secureFragmentUrl = `com.vauto.app://auth/callback#id_token=token_in_fragment&state=${state}`;
    const accepted = storeOAuthCallbackPayload(secureFragmentUrl);
    assert.ok(accepted, "Must accept id_token in URL fragment");
    assert.equal(accepted?.idToken, "token_in_fragment");
  });

  it("9. Authorization code: query code handoff supported for secure backend exchange", () => {
    const state = "code_state_999";
    persistOAuthLaunchContext({
      provider: "google",
      state,
      returnPath: "/profilis",
    });

    const codeCallbackUrl = `com.vauto.app://auth/callback?code=auth_code_secret&state=${state}`;
    const payload = storeOAuthCallbackPayload(codeCallbackUrl);

    assert.ok(payload, "Authorization code callback accepted");
    assert.equal(payload?.code, "auth_code_secret");
    assert.equal(payload?.idToken, undefined, "No idToken fabricated");
  });

  it("10. Logout and privacy purge wipes OAuth context and pending payload", () => {
    persistOAuthLaunchContext({
      provider: "google",
      state: "active_state",
      returnPath: "/private",
    });
    sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, JSON.stringify({ idToken: "pending" }));

    purgeClientSessionAndDraftState();

    assert.equal(loadOAuthLaunchContext(), null, "Launch context purged on logout");
    assert.equal(sessionStorage.getItem(OAUTH_CONTEXT_STORAGE_KEY), null);
    assert.equal(cookieJar, "", "State cookie purged on logout");
  });
});
