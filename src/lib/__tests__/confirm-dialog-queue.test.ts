/**
 * VAUTO AI Maturity — Phase 2A: Chat-Level Human Control Verification.
 *
 * Required scenario 7 — "An intent pivot must not accidentally confirm an
 * earlier unrelated consequential proposal."
 *
 * Proves the single-slot confirm-dialog controller used by
 * `VautoContext.showConfirm()` never lets a second, unrelated confirm
 * request silently strand (or, worse, get conflated with) an earlier one —
 * the earlier prompt is deterministically resolved `false` the moment it is
 * superseded, so its own caller's existing cancellation branch runs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConfirmDialogController } from "../confirm-dialog-queue.js";

interface Dialog {
  id: string;
  message: string;
}

describe("createConfirmDialogController — single dialog slot", () => {
  it("show() then dismiss(true) resolves true and clears current()", async () => {
    const ctrl = createConfirmDialogController<Dialog>();
    const promise = ctrl.show({ id: "A", message: "Block listing A?" });
    assert.deepEqual(ctrl.current(), { id: "A", message: "Block listing A?" });

    ctrl.dismiss(true);
    assert.equal(await promise, true);
    assert.equal(ctrl.current(), null);
  });

  it("show() then dismiss(false) resolves false", async () => {
    const ctrl = createConfirmDialogController<Dialog>();
    const promise = ctrl.show({ id: "A", message: "Block listing A?" });
    ctrl.dismiss(false);
    assert.equal(await promise, false);
  });

  it("dismiss() with nothing pending is a safe no-op", () => {
    const ctrl = createConfirmDialogController<Dialog>();
    assert.doesNotThrow(() => ctrl.dismiss(true));
    assert.equal(ctrl.current(), null);
  });

  it("REQUIRED SCENARIO 7 — an intent pivot (second show() while the first is unanswered) resolves the FIRST proposal false, never confirms it, and the current() dialog is the NEW one", async () => {
    const ctrl = createConfirmDialogController<Dialog>();

    // Turn 1: model proposes blocking listing A -> dialog A shown.
    const firstPromise = ctrl.show({ id: "block-A", message: "Block listing A?" });
    assert.deepEqual(ctrl.current(), { id: "block-A", message: "Block listing A?" });

    // Intent pivot before the user answers dialog A: model proposes marking
    // listing B sold -> dialog B supersedes dialog A.
    const secondPromise = ctrl.show({ id: "sell-B", message: "Mark listing B sold?" });

    // The FIRST proposal must resolve false on its own — it is never left
    // hanging, and it is never resolved `true` by anything the user does
    // for the second dialog.
    assert.equal(await firstPromise, false, "superseded proposal must resolve false, not hang or auto-confirm");

    // Only the second (current, unrelated) proposal is now visible/pending.
    assert.deepEqual(ctrl.current(), { id: "sell-B", message: "Mark listing B sold?" });

    // The user now answers what they actually see (dialog B) — this must
    // resolve ONLY dialog B's promise, matching the visible action exactly.
    ctrl.dismiss(true);
    assert.equal(await secondPromise, true);
    assert.equal(ctrl.current(), null);
  });

  it("REQUIRED SCENARIO 7 — the onSupersede callback fires with the exact superseded payload, enabling an explicit server-side cancel instead of silent TTL-only expiry", async () => {
    const superseded: Dialog[] = [];
    const ctrl = createConfirmDialogController<Dialog>((s) => superseded.push(s));

    const firstPromise = ctrl.show({ id: "block-A", message: "Block listing A?" });
    const secondPromise = ctrl.show({ id: "sell-B", message: "Mark listing B sold?" });

    assert.equal(await firstPromise, false);
    assert.deepEqual(superseded, [{ id: "block-A", message: "Block listing A?" }]);

    ctrl.dismiss(false);
    assert.equal(await secondPromise, false);
    // Dismissing the CURRENT dialog (not a supersede) must never invoke
    // onSupersede again.
    assert.equal(superseded.length, 1);
  });

  it("three rapid pivots: only the last dialog survives, and exactly the first two are reported superseded (never double-resolved)", async () => {
    const superseded: string[] = [];
    const ctrl = createConfirmDialogController<Dialog>((s) => superseded.push(s.id));

    const p1 = ctrl.show({ id: "one", message: "1" });
    const p2 = ctrl.show({ id: "two", message: "2" });
    const p3 = ctrl.show({ id: "three", message: "3" });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, false);
    assert.equal(r2, false);
    assert.deepEqual(superseded, ["one", "two"]);
    assert.deepEqual(ctrl.current(), { id: "three", message: "3" });

    ctrl.dismiss(true);
    assert.equal(await p3, true);
    assert.equal(superseded.length, 2, "the final, actually-confirmed dialog must never be reported as superseded");
  });
});
