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
});
