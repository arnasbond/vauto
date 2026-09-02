import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
const p = (...rel: string[]) => path.join(ROOT, ...rel);

describe("F7 — branding closure (web/PWA)", () => {
  it("manifest carries the final identity (navy + purpose-specific icons)", () => {
    const m = JSON.parse(readFileSync(p("public/manifest.json"), "utf8")) as {
      short_name: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; purpose: string }>;
    };
    assert.equal(m.short_name, "VAUTO");
    assert.equal(m.theme_color, "#0B1220");
    assert.equal(m.background_color, "#0B1220");
    const purposes = m.icons.flatMap((i) => i.purpose.split(/\s+/));
    assert.ok(purposes.includes("any"));
    assert.ok(purposes.includes("maskable"));
    // any vs maskable use DIFFERENT files (different safe-zone contracts).
    const anySrc = m.icons.filter((i) => i.purpose === "any").map((i) => i.src);
    const maskSrc = m.icons.filter((i) => i.purpose === "maskable").map((i) => i.src);
    assert.equal(new Set([...anySrc, ...maskSrc]).size, 4, "no single file reused for both purposes");
  });

  it("all referenced web assets exist with exact sizes", async () => {
    const checks: Array<[string, number, number]> = [
      ["public/icon-192.png", 192, 192],
      ["public/icon-512.png", 512, 512],
      ["public/icon-maskable-192.png", 192, 192],
      ["public/icon-maskable-512.png", 512, 512],
      ["public/apple-touch-icon.png", 180, 180],
      ["public/og-1200x630.png", 1200, 630],
    ];
    for (const [rel, w, h] of checks) {
      assert.ok(existsSync(p(rel)), `${rel} exists`);
      const meta = await sharp(p(rel)).metadata();
      assert.equal(meta.width, w, `${rel} width`);
      assert.equal(meta.height, h, `${rel} height`);
    }
  });

  it("layout metadata points at the final brand assets", () => {
    const layout = readFileSync(p("src/app/layout.tsx"), "utf8");
    assert.ok(layout.includes("/favicon.ico"));
    assert.ok(layout.includes("/apple-touch-icon.png"));
    assert.ok(layout.includes("/og-1200x630.png"));
    assert.ok(layout.includes('themeColor: "#0B1220"'));
  });

  it("canonical SVGs are clean and geometry-stable", () => {
    const icon = readFileSync(p("assets/brand/vauto-icon.svg"), "utf8");
    assert.ok(icon.includes("viewBox"));
    assert.ok(icon.includes('points="12,0 36,0 48,72 24,72"'), "left half geometry unchanged");
    assert.ok(icon.includes('points="60,0 84,0 72,72 48,72"'), "right half geometry unchanged");
    assert.ok(!/<script|foreignObject|<image|linearGradient/i.test(icon));
    assert.ok(!/#1B4DFF|#FF5722|#FF7A1A|#00BFA5/i.test(icon.toUpperCase()));
  });

  it("no second active identity system remains", () => {
    assert.equal(existsSync(p("src/components/VautoLogo.tsx")), false);
    assert.equal(existsSync(p("src/components/VautoHexMark.tsx")), false);
    const brand = readFileSync(p("src/components/ui/BrandLogo.tsx"), "utf8");
    assert.ok(brand.includes("aria-label=\"VAUTO\""), "accessible brand name present");
  });

  it("android legacy colors and vectors are gone", () => {
    assert.equal(
      existsSync(p("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml")),
      false,
      "legacy orange V vector removed"
    );
    assert.equal(
      existsSync(p("android/app/src/main/res/drawable/ic_launcher_background.xml")),
      false,
      "legacy teal background vector removed"
    );
    const colors = readFileSync(
      p("android/app/src/main/res/values/ic_launcher_background.xml"),
      "utf8"
    );
    assert.ok(colors.includes("#0B1220"));
    assert.ok(!colors.includes("#1B4DFF") && !colors.includes("#FF7A1A"));
    const splash = readFileSync(
      p("android/app/src/main/res/drawable/splash_screen.xml"),
      "utf8"
    );
    assert.ok(!/gradient/i.test(splash));
  });

  it("layout metadata contains NO U+FFFD replacement characters", () => {
    const layout = readFileSync(p("src/app/layout.tsx"), "utf8");
    assert.equal(
      layout.includes("\uFFFD"),
      false,
      "no Unicode replacement symbols in metadata"
    );
    assert.ok(layout.includes("juodraštį"));
    assert.ok(layout.includes("transportą"));
    assert.ok(layout.includes("Kainos rėžis"));
  });

  it("horizontal lockup keeps the whole icon + wordmark inside its viewBox", () => {
    const lockup = readFileSync(p("assets/brand/vauto-lockup.svg"), "utf8");
    const vb = lockup.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number) ?? [];
    assert.equal(vb.length, 4);
    const [w, h] = [vb[2]!, vb[3]!];
    // Wordmark: translate(82 y) + width 150 must end exactly at the canvas edge.
    const word = lockup.match(/<g transform="translate\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\) scale\(([^)]+)\)" fill="none"/);
    assert.ok(word, "wordmark group present");
    const wordX = Number(word![1]);
    const wordScale = Number(word![3]);
    // The wordmark was fitted to exactly 150 units wide (viewBox − icon − gap).
    assert.ok(wordX + 150 * wordScale <= w + 0.6, "wordmark fits horizontally");
    assert.ok(72 * wordScale <= h + 0.6, "wordmark fits vertically");
    // Icon group is scaled INTO the canvas: 96 * iconScale ≤ canvas width.
    const icon = lockup.match(/<g transform="translate\(0 (\d+(?:\.\d+)?)\) scale\(([^)]+)\)">/);
    assert.ok(icon, "icon group present");
    assert.ok(96 * Number(icon![2]) <= w + 0.6, "icon square fits the canvas");
  });

  it("OG composition keeps the mark and the wordmark separated and inside 1200x630", () => {
    const og = readFileSync(p("assets/brand/vauto-og.svg"), "utf8");
    const groups = [...og.matchAll(/<g transform="translate\(([^)]+)\) scale\(([^)]+)\)">/g)];
    assert.equal(groups.length, 2);
    const mark = {
      x: Number(groups[0]![1].split(/[,\s]+/)[0]),
      y: Number(groups[0]![1].split(/[,\s]+/)[1]),
      s: Number(groups[0]![2]),
    };
    const word = {
      x: Number(groups[1]![1].split(/[,\s]+/)[0]),
      y: Number(groups[1]![1].split(/[,\s]+/)[1]),
      s: Number(groups[1]![2]),
    };
    const markBottom = mark.y + 72 * mark.s;
    assert.ok(mark.x >= 0 && mark.x + 96 * mark.s <= 1200, "mark inside width");
    assert.ok(word.y + 72 * word.s <= 630, "wordmark inside height");
    assert.ok(
      markBottom <= word.y,
      `mark (bottom ${markBottom}) must not overlap wordmark (top ${word.y})`
    );
  });
});
