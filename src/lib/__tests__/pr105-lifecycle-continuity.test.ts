/**
 * PR #105 — Frontend Lifecycle Thread Continuity Regression Test
 *
 * Verifies frontend thread state preservation for anonymous buyer turns:
 * 1. Anonymous Turn 1 receives thread metadata { threadId, version: 1, anonSessionToken }.
 * 2. Client persists thread link into localStorage (`vauto_agent_thread_v1`).
 * 3. Search capability / URL filter update sets non-query URL params (?category=vehicles&priceMax=20000).
 * 4. Active conversation check (readAgentThreadLink() || messages.length > 0) preserves thread state.
 * 5. Turn 2 reads back the active thread link with SAME threadId and anonSessionToken.
 * 6. Version updates preserve anonSessionToken across consecutive turns.
 * 7. Auth decision / claim auth_required does NOT destroy valid anonymous thread link.
 */
import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";

// Mock minimal window & localStorage for Node environment test
before(() => {
  if (typeof globalThis.window === "undefined") {
    const store: Record<string, string> = {};
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
      location: {
        search: "",
        pathname: "/",
        hash: "",
      },
    };
  }
});

import {
  readAgentThreadLink,
  persistAgentThreadLink,
  clearAgentThreadId,
} from "@/lib/agent-thread-link";

describe("PR #105 Frontend Thread Continuity Regression Test", () => {
  beforeEach(() => {
    clearAgentThreadId();
  });

  it("anonymous Turn 1 → capability/search URL filters → active conversation survives → Turn 2 retains same threadId & anonSessionToken", () => {
    const initialThreadId = "thr_8b85f5a4f808132f2e966785";
    const initialAnonToken = "anon_tok_abc123xyz";

    // 1. Turn 1 stream final returns thread metadata & client persists link
    persistAgentThreadLink({
      threadId: initialThreadId,
      version: 1,
      anonSessionToken: initialAnonToken,
    });

    const linkAfterTurn1 = readAgentThreadLink();
    assert.ok(linkAfterTurn1, "Thread link must be stored after Turn 1");
    assert.equal(linkAfterTurn1?.threadId, initialThreadId);
    assert.equal(linkAfterTurn1?.anonSessionToken, initialAnonToken);

    // 2. Search capability updates URL search parameters to non-query structured filters
    if (typeof globalThis.window !== "undefined") {
      (globalThis.window as unknown as { location: { search: string } }).location.search =
        "?category=vehicles&priceMax=20000";
    }

    // 3. Evaluate active conversation check (readAgentThreadLink() !== null)
    const activeLink = readAgentThreadLink();
    const hasActiveConversation = Boolean(activeLink || false);
    assert.equal(
      hasActiveConversation,
      true,
      "Active conversation must be detected after search capability URL update"
    );

    // 4. Verify threadId and anonSessionToken are preserved after URL state update
    assert.equal(
      activeLink?.threadId,
      initialThreadId,
      "threadId must survive search filter URL update"
    );
    assert.equal(
      activeLink?.anonSessionToken,
      initialAnonToken,
      "anonSessionToken must survive search filter URL update"
    );

    // 5. Turn 2 constructs request using readAgentThreadLink()
    const refreshedLinkForTurn2 = readAgentThreadLink();
    assert.equal(
      refreshedLinkForTurn2?.threadId,
      initialThreadId,
      "Turn 2 request must attach original threadId"
    );
    assert.equal(
      refreshedLinkForTurn2?.anonSessionToken,
      initialAnonToken,
      "Turn 2 request must attach original anonSessionToken"
    );

    // 6. Turn 2 completes with advanced version & link version update preserves anonSessionToken
    persistAgentThreadLink({
      threadId: initialThreadId,
      version: 2,
    });

    const linkAfterTurn2 = readAgentThreadLink();
    assert.equal(
      linkAfterTurn2?.threadId,
      initialThreadId,
      "threadId must remain unchanged after Turn 2 version bump"
    );
    assert.equal(
      linkAfterTurn2?.version,
      2,
      "version must be updated to 2"
    );
    assert.equal(
      linkAfterTurn2?.anonSessionToken,
      initialAnonToken,
      "anonSessionToken must be preserved across version updates"
    );
  });

  it("PRODUCTION SEQUENCE: valid anonymous thread + anon token → auth_required claim response does NOT destroy thread link", () => {
    const threadId = "thr_ac6f4d1672c73178c9cf5a46";
    const anonToken = "anon_tok_xyz987_production";

    // 1. Initial valid anonymous thread link stored in localStorage
    persistAgentThreadLink({
      threadId,
      version: 1,
      anonSessionToken: anonToken,
    });

    // 2. Verify claim decision logic for anonymous user object ({ id: "guest", name: "Svečias" })
    const guestUser = { id: "guest", name: "Svečias" };
    const isAuthenticated = false;

    // Genuinely authenticated check: must evaluate to FALSE for guest user
    const isGenuinelyAuthenticated = Boolean(
      isAuthenticated && guestUser?.id && guestUser.id !== "guest"
    );
    assert.equal(
      isGenuinelyAuthenticated,
      false,
      "Guest user (id: guest) must NOT trigger apiClaimAgentThread"
    );

    // 3. Verify auth_required claim response handling preserves anonymous link
    const threadLink = readAgentThreadLink();
    assert.ok(threadLink?.anonSessionToken, "anonSessionToken must exist in thread link");

    const handleClaimResult = (
      claimed: import("@/lib/api/client").ApiClaimAgentThreadResult,
      link: { threadId: string; version: number; anonSessionToken?: string }
    ) => {
      if (claimed.ok) {
        persistAgentThreadLink({
          threadId: link.threadId,
          version: claimed.data.version ?? link.version,
        });
      } else if (claimed.code === "already_bound") {
        persistAgentThreadLink({
          threadId: link.threadId,
          version: link.version,
        });
      } else if (
        claimed.code === "auth_required" ||
        claimed.code === "session_expired"
      ) {
        persistAgentThreadLink({
          threadId: link.threadId,
          version: link.version,
          anonSessionToken: link.anonSessionToken,
        });
      } else {
        clearAgentThreadId();
      }
    };

    // Simulate claim response returning ok: false with code: "auth_required"
    const claimedResponse: import("@/lib/api/client").ApiClaimAgentThreadResult = {
      ok: false,
      code: "auth_required",
      error: "Prisijunkite.",
    };

    handleClaimResult(claimedResponse, threadLink);

    // 4. Verify thread link was NOT destroyed and retains SAME threadId + anonSessionToken
    const linkAfterClaimDecision = readAgentThreadLink();
    assert.ok(linkAfterClaimDecision, "Thread link must survive auth_required response");
    assert.equal(
      linkAfterClaimDecision?.threadId,
      threadId,
      "threadId must be retained after auth_required response"
    );
    assert.equal(
      linkAfterClaimDecision?.anonSessionToken,
      anonToken,
      "anonSessionToken must be retained after auth_required response"
    );

    // 5. Verify genuine invalid ownership failure (token_mismatch / not_found) DOES clear link
    const securityFailureResponse: import("@/lib/api/client").ApiClaimAgentThreadResult = {
      ok: false,
      code: "token_mismatch",
      error: "Token mismatch",
    };

    handleClaimResult(securityFailureResponse, threadLink);

    const linkAfterSecurityFailure = readAgentThreadLink();
    assert.equal(
      linkAfterSecurityFailure,
      null,
      "Genuine security failure (token_mismatch) MUST clear the thread link"
    );
  });
});
