/**
 * F9 — category parity guards: canonical registry decisions for the Atlas
 * findings (keyboard/laptop → electronics, footwear size preserved, car
 * seat covers NOT vehicles, gifts get one clarifying question, unknown →
 * fail-closed "other").
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceListingCategoryForDb,
  inferCategoryFromContext,
} from "@vauto/shared/category-registry";
import { detectSizeFromText } from "@/lib/clothing-catalog";

describe("F9 — kategorijų paritetas", () => {
  it("USB klaviatūra → electronics", () => {
    assert.equal(
      inferCategoryFromContext(
        "USB klaviatūra",
        "juoda, naudota, pilnai veikia"
      ),
      "electronics"
    );
    assert.equal(
      coerceListingCategoryForDb("novel_label", {
        title: "USB klaviatūra",
        description: "juoda, naudota, pilnai veikia",
        fallback: "other",
      }),
      "electronics"
    );
  });

  it("nešiojamas kompiuteris darbui → electronics (ne jobs)", () => {
    const cat = inferCategoryFromContext(
      "Nešiojamas kompiuteris darbui",
      "laptopas su krepšiu"
    );
    assert.equal(cat, "electronics");
    assert.notEqual(cat, "jobs");
  });

  it("automobilio sėdynių užvalkalai → home (NE transportas)", () => {
    const cat = inferCategoryFromContext(
      "Automobilio sėdynių užvalkalai",
      "universalūs, pilki"
    );
    assert.equal(cat, "home");
    assert.notEqual(cat, "vehicles");
    assert.notEqual(cat, "transport");
  });

  it("tikras automobilis → vehicles (regresija)", () => {
    assert.equal(
      inferCategoryFromContext("BMW 320d", "sedanas, 2018 m."),
      "vehicles"
    );
  });

  it("avalynės dydis išsaugomas (batai 42)", () => {
    assert.equal(detectSizeFromText("Parduodu batus, dydis 42"), "42");
  });

  it("rūbų dydis vis dar veikia (striukė M)", () => {
    assert.equal(detectSizeFromText("Striukė, dydis M"), "M");
  });

  it("nežinoma → fail-closed kita (other)", () => {
    assert.equal(
      inferCategoryFromContext("Nebūdinga prekė", "be aiškaus pagrindo"),
      null
    );
    assert.equal(
      coerceListingCategoryForDb("novel_label", {
        title: "Nebūdinga prekė",
        description: "be aiškaus pagrindo",
        fallback: "other",
      }),
      "other"
    );
  });

  it("Darbas tik tikram darbo pasiūlymui", () => {
    assert.equal(
      inferCategoryFromContext("Ieškau darbo Vilniuje", "vairuotojo vieta"),
      "jobs"
    );
    assert.notEqual(
      inferCategoryFromContext("Nešiojamas kompiuteris darbui", ""),
      "jobs"
    );
  });
});
