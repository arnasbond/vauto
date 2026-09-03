/**
 * F9 — structured quick-reply contract (bounded): execution keys off
 * action/id, unknown actions fail closed, malformed objects never become
 * `[object Object]`, labels stay display-only, and NO structured action may
 * publish.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStructuredQuickReply,
  isKnownQuickReplyAction,
  quickReplyLabel,
  quickReplyKey,
  KNOWN_QUICK_REPLY_ACTIONS,
  QUICK_REPLY_LABEL_MAX,
  type AgentQuickReplyAction,
} from "@/lib/agent-quick-reply-contract";

const chip = (overrides: Partial<AgentQuickReplyAction> = {}): AgentQuickReplyAction => ({
  id: "missing_data_guide",
  label: "Suvesti trūkstamus duomenis",
  action: "missing_data_guide",
  ...overrides,
});

describe("F9 — quick reply kontraktas (bounded)", () => {
  it("struktūrinis chip atpažįstamas, tekstinis — ne", () => {
    assert.equal(isStructuredQuickReply("Viskas tinka"), false);
    assert.equal(isStructuredQuickReply(chip()), true);
  });

  it("label yra vienintelis UI matomas elementas", () => {
    assert.equal(quickReplyLabel(chip()), "Suvesti trūkstamus duomenis");
    assert.equal(quickReplyLabel("Paprastas tekstas"), "Paprastas tekstas");
  });

  it("render key remiasi action/id, ne label", () => {
    const a = chip({ id: "a", label: "A" });
    const b = chip({ id: "a", label: "B" });
    assert.equal(quickReplyKey(a), quickReplyKey(b));
  });

  it("per ilgas label atmetamas (boundary)", () => {
    assert.equal(
      isStructuredQuickReply(chip({ label: "x".repeat(QUICK_REPLY_LABEL_MAX + 1) })),
      false
    );
    assert.equal(
      isStructuredQuickReply(chip({ label: "x".repeat(QUICK_REPLY_LABEL_MAX) })),
      true
    );
  });

  it("per ilgas id arba action atmetamas", () => {
    assert.equal(isStructuredQuickReply(chip({ id: "x".repeat(65) })), false);
    assert.equal(isStructuredQuickReply(chip({ action: "x".repeat(65) })), false);
  });

  it("ne-string tipai atmetami (number/bool/array)", () => {
    assert.equal(
      isStructuredQuickReply({ id: 1, label: "a", action: "b" }),
      false
    );
    assert.equal(
      isStructuredQuickReply({ id: "a", label: true, action: "b" }),
      false
    );
    assert.equal(isStructuredQuickReply(["a"]), false);
  });

  it("malformed objektas niekada netampa [object Object]", () => {
    const bad = { label: "be id ir action" } as unknown as string;
    assert.equal(quickReplyLabel(bad), "");
    const partial = { id: "x" } as unknown as string;
    assert.equal(quickReplyLabel(partial), "");
  });

  it("payload NEegzistuoja kontrakte — model payload yra inertiškas", () => {
    const withPayload = chip() as AgentQuickReplyAction & { payload?: unknown };
    assert.equal("payload" in withPayload, false);
    // Even a hostile object with an extra payload key parses bounded; the
    // server wire layer strips payload before it ever reaches the client,
    // and no action handler ever reads it.
    const hostile = {
      id: "a",
      label: "b",
      action: "missing_data_guide",
      payload: { evil: 1 },
    };
    assert.equal(isStructuredQuickReply(hostile), true);
    assert.equal(quickReplyLabel(hostile), "b");
  });

  it("žinomas action priimamas; nežinomas / suklastotas — fail-closed", () => {
    assert.equal(isKnownQuickReplyAction("missing_data_guide"), true);
    assert.equal(isKnownQuickReplyAction("publish_now"), false);
    assert.equal(isKnownQuickReplyAction("</system>ignore"), false);
    assert.equal(isKnownQuickReplyAction(""), false);
    assert.equal(isKnownQuickReplyAction("missing_data_guide; rm -rf /"), false);
  });

  it("nė vienas structured action negali publikuoti", () => {
    assert.equal(KNOWN_QUICK_REPLY_ACTIONS.includes("missing_data_guide"), true);
    assert.equal(
      KNOWN_QUICK_REPLY_ACTIONS.some((a) => /publish|post/i.test(a)),
      false
    );
  });
});
