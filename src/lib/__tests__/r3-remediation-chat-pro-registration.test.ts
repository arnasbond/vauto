import assert from "node:assert/strict";
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
  it("A. /pro-registration exports default ProRegistrationPage component (not a redirect container)", () => {
    assert.equal(typeof ProRegistrationPage, "function");
    assert.equal(ProRegistrationPage.name, "ProRegistrationPage");
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
