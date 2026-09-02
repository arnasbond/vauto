import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasAnyTrustBadge,
  listingTrustBadges,
  TRUST_BADGE_LABELS,
} from "@/lib/listing-verification";

describe("F7 — verification authority (fail-closed)", () => {
  it("strictly requires === true — forged values never earn a badge", () => {
    const forged = [
      { vinVerified: "true", providerVerified: 1, isVerified: "yes" },
      // eslint-disable-next-line no-new-wrappers
      { vinVerified: new Boolean(true), providerVerified: "1", isVerified: undefined },
      { vinVerified: 1, providerVerified: "true", isVerified: undefined },
    ];
    for (const input of forged) {
      assert.deepEqual(
        listingTrustBadges(input),
        [],
        `forged input must yield no badges: ${JSON.stringify(input)}`
      );
    }
  });

  it("missing/undefined verification values yield no badges", () => {
    assert.deepEqual(listingTrustBadges({}), []);
    assert.deepEqual(listingTrustBadges({ vinVerified: undefined }), []);
    assert.deepEqual(listingTrustBadges({ providerVerified: null }), []);
    assert.deepEqual(listingTrustBadges({ isVerified: false }), []);
  });

  it("each authority renders its OWN precise badge", () => {
    assert.deepEqual(listingTrustBadges({ vinVerified: true }), [
      { key: "vin", label: "VIN patikrinta" },
    ]);
    assert.deepEqual(listingTrustBadges({ providerVerified: true }), [
      { key: "provider", label: "Pardavėjas patvirtintas" },
    ]);
    assert.deepEqual(listingTrustBadges({ isVerified: true }), [
      { key: "listing", label: "Skelbimas patvirtintas" },
    ]);
  });

  it("combined authorities produce distinct badges in canonical order", () => {
    const badges = listingTrustBadges({
      vinVerified: true,
      providerVerified: true,
      isVerified: true,
    });
    assert.deepEqual(
      badges.map((b) => b.key),
      ["vin", "provider", "listing"]
    );
    assert.equal(new Set(badges.map((b) => b.label)).size, 3, "labels are distinct");
  });

  it("the old generic label is not part of the badge vocabulary", () => {
    for (const label of Object.values(TRUST_BADGE_LABELS)) {
      assert.notEqual(label, "Patvirtinta", "no generic combined badge");
    }
  });

  it("hasAnyTrustBadge is true only for a real badge", () => {
    assert.equal(hasAnyTrustBadge({ vinVerified: true } as never), true);
    assert.equal(hasAnyTrustBadge({ isVerified: "true" } as never), false);
  });
});
