import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  saveClothingListingDraft,
  loadClothingListingDraft,
  saveGeneralListingDraft,
  loadGeneralListingDraft,
  saveServiceListingDraft,
  loadServiceListingDraft,
  upsertMultiListingDraft,
  listMultiListingDrafts,
} from "@/lib/listing-draft-storage";
import {
  persistAgentThreadLink,
  readAgentThreadLink,
} from "@/lib/agent-thread-link";
import {
  purgeClientSessionAndDraftState,
  subscribeAuthLogout,
} from "@/lib/auth/logout-cleanup";
import {
  activateUserScope,
  getActiveUserScope,
} from "@/lib/auth/user-scope";
import type { AiExtractedListing } from "@/lib/types";

// Mock minimal window & localStorage/sessionStorage environment for node:test
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

class MockEventTarget {
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
    return true;
  }
}

const mockStorage = new MockStorage();
const mockSession = new MockStorage();
const mockWindow = new MockEventTarget() as unknown as Window & typeof globalThis;
(mockWindow as unknown as { localStorage: Storage }).localStorage = mockStorage as unknown as Storage;
(mockWindow as unknown as { sessionStorage: Storage }).sessionStorage = mockSession as unknown as Storage;

// Install mock window and localStorage globals if not present
if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = mockWindow;
}
if (typeof globalThis.localStorage === "undefined") {
  (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;
}
if (typeof globalThis.sessionStorage === "undefined") {
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = mockSession;
}
if (typeof globalThis.CustomEvent === "undefined") {
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class MockCustomEvent extends Event {
    detail: unknown;
    constructor(type: string, dict?: { detail?: unknown }) {
      super(type);
      this.detail = dict?.detail;
    }
  };
}

const SAMPLE_DRAFT: AiExtractedListing = {
  title: "BMW 520d 2018",
  description: "Tvarkingas automobilis",
  price: 15500,
  location: "Vilnius",
  category: "cars",
  attributes: {
    clientDraftId: "draft_user_a_123",
  },
};

describe("P0.1 — Logout privacy and state purge", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("1. purgeClientSessionAndDraftState wipes all listing drafts from localStorage", () => {
    saveClothingListingDraft({ ...SAMPLE_DRAFT, category: "clothing" }, null);
    saveGeneralListingDraft({ ...SAMPLE_DRAFT, category: "general" }, null);
    saveServiceListingDraft({ ...SAMPLE_DRAFT, category: "services" }, null);
    upsertMultiListingDraft(SAMPLE_DRAFT, null);

    assert.ok(loadClothingListingDraft(), "Clothing draft should exist before purge");
    assert.ok(loadGeneralListingDraft(), "General draft should exist before purge");
    assert.ok(loadServiceListingDraft(), "Service draft should exist before purge");
    assert.equal(listMultiListingDrafts().length, 1, "Multi-draft entry should exist before purge");

    purgeClientSessionAndDraftState();

    assert.equal(loadClothingListingDraft(), null, "Clothing draft must be null after purge");
    assert.equal(loadGeneralListingDraft(), null, "General draft must be null after purge");
    assert.equal(loadServiceListingDraft(), null, "Service draft must be null after purge");
    assert.equal(listMultiListingDrafts().length, 0, "Multi drafts must be empty after purge");
  });

  it("2. purgeClientSessionAndDraftState wipes agent thread link from localStorage", () => {
    persistAgentThreadLink({
      threadId: "thr_user_a_secret",
      version: 3,
      anonSessionToken: "user_a_token",
    });

    const stored = readAgentThreadLink();
    assert.equal(stored?.threadId, "thr_user_a_secret");

    purgeClientSessionAndDraftState();

    assert.equal(readAgentThreadLink(), null, "Thread link must be null after purge");
  });

  it("3. purgeClientSessionAndDraftState notifies subscribers via subscribeAuthLogout", () => {
    let notified = false;
    const unsubscribe = subscribeAuthLogout(() => {
      notified = true;
    });

    purgeClientSessionAndDraftState();
    assert.equal(notified, true, "Subscriber must be notified on logout purge");

    // After unsubscribe, no further notifications
    notified = false;
    unsubscribe();
    purgeClientSessionAndDraftState();
    assert.equal(notified, false, "Unsubscribed handler must not be called");
  });

  it("4. User A logout ensures User B or Anonymous cannot inherit User A drafts or thread", () => {
    // User A session: creates drafts, active user scope, and thread
    activateUserScope("user-A");
    assert.equal(getActiveUserScope(), "user-A");

    upsertMultiListingDraft(SAMPLE_DRAFT, null);
    persistAgentThreadLink({
      threadId: "thr_user_a_private",
      version: 5,
    });

    // User A logs out
    purgeClientSessionAndDraftState();

    // Anonymous inspection
    assert.equal(getActiveUserScope(), null, "Active user scope must be cleared");
    assert.equal(listMultiListingDrafts().length, 0, "Anonymous user cannot see User A drafts");
    assert.equal(readAgentThreadLink(), null, "Anonymous user cannot see User A thread");

    // User B logs in
    activateUserScope("user-B");
    assert.equal(getActiveUserScope(), "user-B");
    assert.equal(listMultiListingDrafts().length, 0, "User B cannot inherit User A drafts");
    assert.equal(readAgentThreadLink(), null, "User B cannot inherit User A thread");
  });
});
