import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { VISIBLE_CATEGORY_IDS } from "@vauto/shared/category-registry";
import { CATEGORY_IMAGE_SRC, categoryImageFor } from "@/lib/category-imagery";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
const p = (...rel: string[]) => path.join(ROOT, ...rel);

describe("F7 — premium category imagery", () => {
  it("ALL 8 visible categories have a premium image asset", () => {
    for (const id of VISIBLE_CATEGORY_IDS) {
      const src = categoryImageFor(id);
      assert.ok(src, `category ${id} has premium imagery`);
      assert.ok(src!.webp.startsWith("/images/categories/"), `${id} webp is local`);
      assert.ok(src!.png.startsWith("/images/categories/"), `${id} png is local`);
    }
    assert.deepEqual(
      Object.keys(CATEGORY_IMAGE_SRC).sort(),
      [...VISIBLE_CATEGORY_IDS].sort(),
      "imagery registry covers exactly the 8 visible categories"
    );
  });

  it("no stock or external runtime URLs anywhere", () => {
    for (const src of Object.values(CATEGORY_IMAGE_SRC)) {
      for (const url of [src.webp, src.webp2x, src.png]) {
        assert.ok(
          !/^https?:|unsplash|picsum|cloudinary|loremflickr|placehold/i.test(url),
          `${url} must be a local repo asset`
        );
      }
    }
  });

  it("Mada / Darbas / Kita files exist with correct dimensions", async () => {
    const checks: Array<[string, number, number]> = [
      ["public/images/categories/category-clothing.png", 480, 480],
      ["public/images/categories/category-clothing.webp", 240, 240],
      ["public/images/categories/category-clothing@2x.webp", 480, 480],
      ["public/images/categories/category-jobs.png", 480, 480],
      ["public/images/categories/category-jobs.webp", 240, 240],
      ["public/images/categories/category-jobs@2x.webp", 480, 480],
      ["public/images/categories/category-other.png", 480, 480],
      ["public/images/categories/category-other.webp", 240, 240],
      ["public/images/categories/category-other@2x.webp", 480, 480],
    ];
    for (const [rel, w, h] of checks) {
      assert.ok(existsSync(p(rel)), `${rel} exists`);
      const meta = await sharp(p(rel)).metadata();
      assert.equal(meta.width, w, `${rel} width`);
      assert.equal(meta.height, h, `${rel} height`);
    }
  });

  it("the three new illustrations are isolated with a soft shadow and no clipping", async () => {
    for (const name of ["clothing", "jobs", "other"]) {
      const { data, info } = await sharp(
        p(`public/images/categories/category-${name}.png`)
      )
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at = (fx: number, fy: number) => {
        const i =
          (Math.round((fy / 1024) * info.height) * info.width +
            Math.round((fx / 1024) * info.width)) *
          info.channels;
        return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3] ?? 255];
      };
      for (const [ex, ey] of [
        [8, 512], [1016, 512], [512, 8], [512, 1016],
        [20, 20], [1004, 20], [20, 1004], [1004, 1004],
      ]) {
        assert.ok(at(ex, ey)[3]! <= 8, `${name} must not clip at (${ex},${ey})`);
      }
      const shadow = at(512, 902)[3]!;
      assert.ok(shadow > 0 && shadow < 120, `${name} has a soft contact shadow (alpha ${shadow})`);
      const center = at(512, 480)[3]!;
      assert.equal(center, 255, `${name} object is present at the center`);
    }
  });

  it("contact sheet with all 8 categories exists", async () => {
    const sheet = p("docs/categories/vauto-8-categories.png");
    assert.ok(existsSync(sheet));
    const meta = await sharp(sheet).metadata();
    assert.ok(meta.width! >= 1280, "contact sheet is wide enough for 8 tiles");
  });
});
