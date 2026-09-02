import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(
  path.resolve(__dirname, "../../design-system/tokens.css"),
  "utf8"
);

function hexOf(varName: string, block: string): string | null {
  const re = new RegExp(
    `${varName.replace(/[-]/g, "\\-")}:\\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\\b`
  );
  const m = block.match(re);
  return m ? m[1]!.toLowerCase() : null;
}

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function relativeLuminance(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The light (:root) block and the dark block of tokens.css. */
function lightBlock(): string {
  const root = tokensCss.match(/:root\s*\{([\s\S]*?)\n\}/);
  assert.ok(root, "light :root block exists");
  return root![1]!;
}

function darkBlock(): string {
  const m = tokensCss.match(
    /html\[data-app-theme="dark"\],[\s\S]*?\.ds-theme-dark\s*\{([\s\S]*?)\n\}/
  );
  assert.ok(m, "dark theme block exists");
  return m![1]!;
}

describe("F7 — light theme depth contract", () => {
  it("defines first-class interaction state tokens", () => {
    for (const token of [
      "--ds-state-hover",
      "--ds-state-pressed",
      "--ds-state-selected",
      "--ds-state-selected-border",
    ]) {
      assert.ok(lightBlock().includes(`${token}:`), `light block defines ${token}`);
      assert.ok(darkBlock().includes(`${token}:`), `dark block defines ${token}`);
    }
  });

  it("defines a default border token and card elevation tokens", () => {
    for (const token of [
      "--ds-border-default",
      "--ds-card-border",
      "--ds-card-shadow",
      "--ds-card-shadow-hover",
    ]) {
      assert.ok(lightBlock().includes(`${token}:`), `light block defines ${token}`);
      assert.ok(darkBlock().includes(`${token}:`), `dark block defines ${token}`);
    }
  });

  it("separates page background from card surface (page ≠ white card)", () => {
    const page = hexOf("--ds-surface-page", lightBlock());
    const card = hexOf("--ds-surface-card", lightBlock());
    assert.ok(page && card);
    assert.notEqual(page, "#ffffff", "page background is not a white card");
    assert.equal(card, "#ffffff");
    assert.ok(
      relativeLuminance(page, card) > 1.0,
      "page vs card have a measurable luminance difference"
    );
  });

  it("default border is darker than subtle border (stronger edges)", () => {
    const subtle = hexOf("--ds-border-subtle", lightBlock());
    const def = hexOf("--ds-border-default", lightBlock());
    assert.ok(subtle && def);
    assert.ok(
      luminance(subtle) > luminance(def),
      `default border (${def}) must be darker than subtle (${subtle})`
    );
  });

  it("card shadow tokens resolve to shadow values (resting + hover)", () => {
    const resting = lightBlock().match(/--ds-card-shadow:\s*(var\(--ds-shadow-xs\));/);
    assert.ok(resting, "resting card shadow uses the ds shadow scale");
    const hover = lightBlock().match(/--ds-card-shadow-hover:\s*var\(--ds-shadow-md\);?/);
    assert.ok(hover, "hover card shadow uses the ds shadow scale");
    // Dark cards stay flat: no fabricated depth.
    assert.ok(darkBlock().includes("--ds-card-shadow: none"));
  });
});
