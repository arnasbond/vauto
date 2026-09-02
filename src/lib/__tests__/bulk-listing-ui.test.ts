import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BULK_MAX_TARGETS,
  BULK_CONFLICT_CODES,
  canUseBulkUi,
  conflictIsDisabled,
  conflictNeedsNewPreview,
  conflictNeedsRecovery,
  formatProposalExpiry,
  listingSupportsOperation,
  proposalClock,
  resultStateFromConfirm,
  selectableListings,
  summarizeOutcomes,
  toggleSelectAllVisible,
  toggleSelection,
  validateSelectionCount,
  type BulkEligibleListing,
} from "@/lib/bulk-listing-ui";

const listings: BulkEligibleListing[] = [
  { id: "l-1", title: "Volvo", status: "active" },
  { id: "l-2", title: "Butas", status: "active" },
  { id: "l-3", title: "iPhone", status: "deleted" },
  { id: "l-4", title: "Sofa", status: "paused" },
  { id: "l-5", title: "Futbolas", status: "sold" },
];

describe("F6 Final — bulk UI role gate", () => {
  it("allows pro / admin / super_admin only", () => {
    assert.equal(canUseBulkUi("pro"), true);
    assert.equal(canUseBulkUi("admin"), true);
    assert.equal(canUseBulkUi("super_admin"), true);
    assert.equal(canUseBulkUi("buyer"), false);
    assert.equal(canUseBulkUi(""), false);
    assert.equal(canUseBulkUi(null), false);
  });
});

describe("F6 Final — eligibility by operation", () => {
  it("hide targets active/paused only; republish targets deleted only", () => {
    assert.equal(listingSupportsOperation({ status: "active" }, "hide"), true);
    assert.equal(listingSupportsOperation({ status: "paused" }, "hide"), true);
    assert.equal(listingSupportsOperation({ status: "deleted" }, "hide"), false);
    assert.equal(listingSupportsOperation({ status: "sold" }, "hide"), false);
    assert.equal(listingSupportsOperation({ status: "deleted" }, "republish"), true);
    assert.equal(listingSupportsOperation({ status: "active" }, "republish"), false);
    assert.equal(listingSupportsOperation({}, "hide"), false);
  });

  it("selectableListings filters per operation", () => {
    assert.deepEqual(
      selectableListings(listings, "hide").map((l) => l.id),
      ["l-1", "l-2", "l-4"]
    );
    assert.deepEqual(
      selectableListings(listings, "republish").map((l) => l.id),
      ["l-3"]
    );
  });
});

describe("F6 Final — select all is scoped to the clearly visible set", () => {
  it("selects only visible+eligible ids; never hidden rows", () => {
    const selected = toggleSelectAllVisible(
      ["l-1", "l-3", "l-5"],
      [],
      "hide",
      listings
    );
    assert.deepEqual(selected, ["l-1"], "l-3/l-5 are not hide-eligible");
  });

  it("toggles off when every visible id is already selected", () => {
    const selected = toggleSelectAllVisible(
      ["l-1", "l-2"],
      ["l-1", "l-2"],
      "hide",
      listings
    );
    assert.deepEqual(selected, []);
  });

  it("adds visible ids to an existing selection without duplicates", () => {
    const selected = toggleSelectAllVisible(
      ["l-2", "l-4"],
      ["l-1"],
      "hide",
      listings
    );
    assert.deepEqual(selected, ["l-1", "l-2", "l-4"]);
  });

  it("single toggle is idempotent and sorted", () => {
    assert.deepEqual(toggleSelection("l-2", ["l-1"]), ["l-1", "l-2"]);
    assert.deepEqual(toggleSelection("l-1", ["l-1", "l-2"]), ["l-2"]);
  });
});

describe("F6 Final — selection limits", () => {
  it("rejects zero selection", () => {
    const r = validateSelectionCount([]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "empty");
  });

  it("rejects more than BULK_MAX_TARGETS", () => {
    const ids = Array.from({ length: BULK_MAX_TARGETS + 1 }, (_, i) => `id-${i}`);
    const r = validateSelectionCount(ids);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "too_many");
  });

  it("accepts exactly BULK_MAX_TARGETS", () => {
    const ids = Array.from({ length: BULK_MAX_TARGETS }, (_, i) => `id-${i}`);
    assert.equal(validateSelectionCount(ids).ok, true);
  });
});

describe("F6 Final — proposal clock", () => {
  it("fresh preview shows remaining seconds; expired shows expired", () => {
    const preview = {
      digest: "d",
      executionEnabled: true,
      proposal: {
        operation: "hide" as const,
        expiresAt: 10_000,
        items: [],
        ownedCount: 0,
        warnings: [],
      },
    };
    const fresh = proposalClock(preview, 1_000);
    assert.equal(fresh.kind, "fresh");
    if (fresh.kind === "fresh") assert.equal(fresh.secondsLeft, 9);
    const expired = proposalClock(preview, 10_001);
    assert.equal(expired.kind, "expired");
    assert.equal(proposalClock(null, 0).kind, "expired");
  });

  it("formats expiry as mm:ss", () => {
    assert.equal(formatProposalExpiry(125_000, 5_000), "2:00");
  });
});

describe("F6 Final — outcome summary", () => {
  it("counts success/failed/skipped and flags partial failure", () => {
    const s = summarizeOutcomes([
      { id: "a", status: "success" },
      { id: "b", status: "success" },
      { id: "c", status: "failed", reason: "not_owned" },
      { id: "d", status: "skipped", reason: "duplicate" },
    ]);
    assert.deepEqual(s, {
      success: 2,
      failed: 1,
      skipped: 1,
      total: 4,
      isPartialFailure: true,
    });
    assert.equal(
      summarizeOutcomes([{ id: "x", status: "failed", reason: "r" }]).isPartialFailure,
      false,
      "pure failure is not a partial failure"
    );
  });
});

describe("F6 Final — confirm result state machine", () => {
  it("maps ok responses to done with replay flag", () => {
    const state = resultStateFromConfirm(
      {
        ok: true,
        outcomes: [{ id: "l-1", status: "success", detail: "hidden" }],
        replayed: true,
        state: "COMPLETED",
      },
      null
    );
    assert.equal(state.kind, "done");
    if (state.kind === "done") {
      assert.equal(state.replayed, true);
      assert.equal(state.summary.success, 1);
    }
  });

  it("maps conflict codes", () => {
    for (const code of Object.values(BULK_CONFLICT_CODES)) {
      const state = resultStateFromConfirm(
        { ok: false, code, error: "msg" },
        null
      );
      assert.equal(state.kind, "conflict");
      if (state.kind === "conflict") assert.equal(state.code, code);
    }
    const err = resultStateFromConfirm(null, "network down");
    assert.equal(err.kind, "conflict");
  });

  it("conflict helpers route recovery / new preview / disabled", () => {
    assert.equal(conflictNeedsRecovery("recovery_required"), true);
    assert.equal(conflictNeedsRecovery("fenced"), true);
    assert.equal(conflictNeedsRecovery("in_progress"), true);
    assert.equal(conflictNeedsRecovery("tampered"), false);
    assert.equal(conflictNeedsNewPreview("expired"), true);
    assert.equal(conflictNeedsNewPreview("tampered"), true);
    assert.equal(conflictIsDisabled("disabled"), true);
    assert.equal(conflictIsDisabled("unauthorized"), true);
  });
});
