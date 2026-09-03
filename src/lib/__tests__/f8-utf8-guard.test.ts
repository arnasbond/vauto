import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
const p = (...rel: string[]) => path.join(ROOT, ...rel);

/** Files touched by the F8 wave whose user-facing/accessibility text must
 *  be clean UTF-8 (no U+FFFD, no mojibake markers). */
const F8_TEXT_FILES = [
  "src/components/listing/ListingImageGallery.tsx",
  "src/components/listing/ListingImage.tsx",
  "src/components/marketplace/ListingCard.tsx",
  "src/components/marketplace/ListingMapViewInner.tsx",
  "src/components/home/HomeCategoryGrid.tsx",
];

describe("F8 — UTF-8 regression guard", () => {
  it("no U+FFFD replacement characters in F8 user-facing files", () => {
    for (const rel of F8_TEXT_FILES) {
      const text = readFileSync(p(rel), "utf8");
      assert.equal(
        text.includes("\uFFFD"),
        false,
        `${rel} contains a Unicode replacement character`
      );
      assert.equal(
        text.includes("�"),
        false,
        `${rel} contains the mojibake marker`
      );
    }
  });

  it("the gallery zoom aria-label is exact Lithuanian", () => {
    const gallery = readFileSync(p("src/components/listing/ListingImageGallery.tsx"), "utf8");
    assert.ok(gallery.includes('aria-label="Padidinti nuotrauką"'));
  });
});
