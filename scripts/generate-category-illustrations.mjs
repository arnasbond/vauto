/**
 * F7 Premium Category Imagery — contact-sheet generator (LIGHT + DARK).
 *
 * Composites ALL 8 served category assets at their REAL tile scale (the
 * 96px illustration inside the actual card surface) on:
 *   - a LIGHT card (#FFFFFF, border #E2E7F0) on a light page (#F3F5F9);
 *   - a DARK card (#121A2B) on a dark page (#0B1220).
 *
 * The served triplets come from scripts/process-category-images.mjs
 * (Atlas photorealistic sources + white-background keying). This script
 * NEVER regenerates object sources.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const p = (...rel) => path.join(ROOT, ...rel);

const CATEGORIES = [
  ["category-transport.png", "Transportas"],
  ["category-real-estate.png", "Nekilnojamas turtas"],
  ["category-electronics.png", "Elektronika"],
  ["category-clothing.png", "Mada"],
  ["category-home-garden.png", "Namai ir buitis"],
  ["category-services.png", "Paslaugos"],
  ["category-jobs.png", "Darbas"],
  ["category-other.png", "Kita"],
];

// Real tile scale: the lg HomeCategoryGrid renders a 96px illustration in a
// ~130px-wide card (grid-cols-8 on desktop, 2-col on mobile — same asset box).
const TILE = 132;
const IMG = 96;
const GAP = 14;
const MARGIN = 36;

async function sheet(theme) {
  const light = theme === "light";
  const pageBg = light ? "#F3F5F9" : "#0B1220";
  const cardBg = light ? "#FFFFFF" : "#121A2B";
  const border = light ? "#E2E7F0" : "rgba(244,246,251,0.1)";
  const labelFill = light ? "#3A4558" : "#C5CCD9";
  const titleFill = light ? "#0B1220" : "#F4F6FB";

  const cols = 4;
  const W = MARGIN * 2 + cols * TILE + (cols - 1) * GAP;
  const rows = Math.ceil(CATEGORIES.length / cols);
  const top = 96;
  const rowH = TILE + 44;
  const H = top + rows * rowH + MARGIN;

  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${pageBg}"/>` +
    `<text x="${MARGIN}" y="${top - 40}" font-family="sans-serif" font-size="24" font-weight="700" fill="${titleFill}">VAUTO — 8 kategorijos · ${light ? "šviesi" : "tamsi"} tema · realus kortelės mastelis</text>`;

  const composites = [];
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const [file, name] = CATEGORIES[i];
    const x = MARGIN + (i % cols) * (TILE + GAP);
    const y = top + Math.floor(i / cols) * rowH;
    // Card surface + border via SVG, object composited as bitmap.
    svg +=
      `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="14" fill="${cardBg}" stroke="${border}"/>` +
      `<text x="${x + TILE / 2}" y="${y + TILE + 22}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="${labelFill}">${name}</text>`;
    const img = await sharp(p(`public/images/categories/${file}`))
      .resize(IMG, IMG, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({
      input: img,
      left: x + (TILE - IMG) / 2,
      top: y + (TILE - IMG) / 2,
    });
  }
  svg += `</svg>`;
  const labels = await sharp(Buffer.from(svg)).png().toBuffer();
  composites.push({ input: labels, left: 0, top: 0 });

  const base = sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 243, g: 245, b: 249, alpha: 0 },
    },
  });
  const out = `docs/categories/vauto-8-categories-${theme}.png`;
  mkdirSync(path.dirname(p(out)), { recursive: true });
  await base.composite(composites).png({ compressionLevel: 9 }).toFile(p(out));
  console.log(`  ${out} (${W}x${H})`);
}

console.log("Building real-scale contact sheets…");
await sheet("light");
await sheet("dark");
console.log("Done.");
