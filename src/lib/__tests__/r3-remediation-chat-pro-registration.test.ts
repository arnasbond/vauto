import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import ProRegistrationPage from "@/app/pro-registration/page";

function canonicalizeChatQueryParams(rawQuery: string): string {
  const params = new URLSearchParams(rawQuery);
  const threadId = params.get("id") || params.get("thread");
  if (threadId) {
    params.set("id", threadId);
    params.delete("thread");
  }
  const q = params.toString();
  return q ? `/pokalbiai/?${q}` : "/pokalbiai/";
}

function parseQueryParams(url: string): Record<string, string> {
  const q = url.split("?")[1] || "";
  const params = new URLSearchParams(q);
  const out: Record<string, string> = {};
  for (const [k, v] of params) {
    out[k] = v;
  }
  return out;
}

describe("R3 Remediation — Pro Registration & Chat Query Preservation", () => {
  it("A. /pro-registration references ProRegistrationForm, auth hydration, and is NOT a redirect container", () => {
    assert.equal(typeof ProRegistrationPage, "function");
    assert.equal(ProRegistrationPage.name, "ProRegistrationPage");

    const pagePath = path.resolve(process.cwd(), "src/app/pro-registration/page.tsx");
    const source = fs.readFileSync(pagePath, "utf-8");

    // Must reference the ProRegistrationForm component
    assert.ok(
      source.includes("ProRegistrationForm"),
      "/pro-registration/page.tsx must reference ProRegistrationForm"
    );

    // Must handle auth hydration, unauthenticated state & already-pro role
    assert.ok(
      source.includes("authHydrated"),
      "/pro-registration/page.tsx must handle authHydrated"
    );
    assert.ok(
      source.includes("isAuthenticated"),
      "/pro-registration/page.tsx must handle isAuthenticated"
    );
    assert.ok(
      source.includes('user.role === "pro"'),
      "/pro-registration/page.tsx must handle already-pro role"
    );

    // Must NOT be a redirect container to /verslui
    assert.ok(
      !source.includes("ProRegistrationRedirectContent"),
      "/pro-registration/page.tsx must NOT be a redirect container"
    );
    assert.ok(
      !source.includes('router.replace("/verslui'),
      "/pro-registration/page.tsx must NOT redirect to /verslui"
    );
  });

  it("B. /chats/thread redirect canonicalizes thread -> id while preserving escrow, session_id & extra params", () => {
    const raw = "thread=thr_999&escrow=success&session_id=cs_888&source=push";
    const target = canonicalizeChatQueryParams(raw);
    const parsed = parseQueryParams(target);
    assert.equal(parsed.id, "thr_999");
    assert.equal(parsed.escrow, "success");
    assert.equal(parsed.session_id, "cs_888");
    assert.equal(parsed.source, "push");
    assert.equal(parsed.thread, undefined);
  });

  it("C. /chats/thread redirect preserves existing id parameter when present", () => {
    const raw = "id=thr_777&escrow=cancel";
    const target = canonicalizeChatQueryParams(raw);
    const parsed = parseQueryParams(target);
    assert.equal(parsed.id, "thr_777");
    assert.equal(parsed.escrow, "cancel");
  });

  it("D. empty query params redirect to /pokalbiai/", () => {
    assert.equal(canonicalizeChatQueryParams(""), "/pokalbiai/");
  });
});
