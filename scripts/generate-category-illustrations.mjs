/**
 * F7 Premium Category Imagery — the three missing premium illustrations.
 *
 * Procedurally drawn, VAUTO-owned flat premium product illustrations that
 * match the visual weight of the existing category objects:
 *   - Mada:  cream cardigan on a wooden hanger;
 *   - Darbas: dark brown leather document portfolio;
 *   - Kita:   neutral cardboard shipping box.
 *
 * Contract: object isolated on TRANSPARENT background, centered, soft
 * contact shadow, no text/logos/people/scene, no green card background, no
 * gradients on the backdrop, nothing clipped, readable in LIGHT and DARK.
 * Each is emitted at 1024 for the source folder and as the served triplet
 * (png 480 + webp 240 + @2x webp 480) in public/images/categories/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const p = (...rel) => path.join(ROOT, ...rel);

const out = (rel, buf) => {
  const target = p(rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buf);
  console.log(`  ${rel} (${buf.length} B)`);
};
/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const SHADOW = `<ellipse cx="512" cy="896" rx="250" ry="34" fill="rgba(11,18,32,0.14)" filter="url(#soft)"/>`;

function frame(inner, extraDefs = "") {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">` +
    `<defs><filter id="soft" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>${extraDefs}</defs>` +
    inner +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* Mada — cream cardigan on a wooden hanger                            */
/* ------------------------------------------------------------------ */

function clothingSvg() {
  const hangerHook =
    `<path d="M512 118 q0 78 74 88" fill="none" stroke="#8E9AAC" stroke-width="18" stroke-linecap="round"/>` +
    `<path d="M512 118 l-2 0" fill="none" stroke="#8E9AAC" stroke-width="22" stroke-linecap="round"/>`;
  const hangerBar =
    `<path d="M382 258 Q512 206 642 258 L626 290 Q512 246 398 290 Z" fill="#C89B6C"/>` +
    `<path d="M382 258 Q512 206 642 258" fill="none" stroke="#A97E52" stroke-width="12" stroke-linecap="round"/>`;
  // Cardigan body: two front panels + collar + sleeves.
  const cardigan =
    `<g>` +
    // sleeves
    `<path d="M330 330 Q282 470 300 622 L356 622 Q336 476 366 358 Z" fill="#E9DCC4"/>` +
    `<path d="M694 330 Q742 470 724 622 L668 622 Q688 476 658 358 Z" fill="#E9DCC4"/>` +
    // torso
    `<path d="M366 300 Q512 350 658 300 L664 700 Q512 736 360 700 Z" fill="#F1E5CE"/>` +
    // left front panel (slightly darker)
    `<path d="M368 316 Q440 366 508 368 L496 702 Q436 720 368 692 Z" fill="#E9DCC4"/>` +
    // collar V
    `<path d="M368 316 Q440 366 508 368 L466 316 Q424 292 368 316 Z" fill="#E0CFAF"/>` +
    `<path d="M508 368 Q576 366 656 316 L612 292 Q560 300 508 368 Z" fill="#E0CFAF"/>` +
    // buttons
    `<circle cx="446" cy="470" r="14" fill="#B99B6B"/><circle cx="446" cy="560" r="14" fill="#B99B6B"/>` +
    // ribbed hem
    `<g fill="none" stroke="#DECBA9" stroke-width="10" stroke-linecap="round">` +
    `<path d="M380 672 Q512 702 644 672"/><path d="M392 694 Q512 722 632 694"/></g>` +
    `</g>`;
  return frame(SHADOW + hangerHook + hangerBar + cardigan);
}

/* ------------------------------------------------------------------ */
/* Darbas — dark brown leather document portfolio                      */
/* ------------------------------------------------------------------ */

function jobsSvg() {
  const portfolio =
    `<g transform="rotate(-3 512 512)">` +
    // body
    `<rect x="330" y="238" width="364" height="520" rx="26" fill="#4A3428"/>` +
    // front panel lighter
    `<rect x="330" y="238" width="364" height="520" rx="26" fill="none" stroke="#33221A" stroke-width="10"/>` +
    `<path d="M330 264 h364 v-26 q0 -26 26 -26 h-364 q-26 0 -26 26 Z" fill="#5C4433"/>` +
    // flap
    `<path d="M330 238 L512 360 L694 238 L694 238 q0 30 -30 30 L360 268 q-30 0 -30 -30 Z" fill="#3E2B1F"/>` +
    // stitching
    `<rect x="356" y="300" width="312" height="430" rx="14" fill="none" stroke="#6B4F3B" stroke-width="8" stroke-dasharray="14 12"/>` +
    // brass buckle
    `<rect x="472" y="360" width="80" height="56" rx="12" fill="none" stroke="#B98B4F" stroke-width="14"/>` +
    `<rect x="492" y="380" width="40" height="16" rx="4" fill="#B98B4F"/>` +
    // highlight
    `<path d="M346 260 L346 744" stroke="rgba(255,255,255,0.12)" stroke-width="12" stroke-linecap="round"/>` +
    `</g>`;
  return frame(SHADOW + portfolio);
}

/* ------------------------------------------------------------------ */
/* Kita — neutral cardboard shipping box                               */
/* ------------------------------------------------------------------ */

function otherSvg() {
  const box =
    `<g transform="rotate(2 512 512)">` +
    // body
    `<rect x="300" y="300" width="424" height="424" rx="18" fill="#C9A36F"/>` +
    `<rect x="300" y="300" width="424" height="424" rx="18" fill="none" stroke="#B08A55" stroke-width="10"/>` +
    // side shading (right inner panel)
    `<path d="M724 318 h-8 v406 h8 Z" fill="#B8925F"/>` +
    // flaps
    `<path d="M300 300 L460 236 L724 300 Z" fill="#D6B587"/>` +
    `<path d="M300 300 L460 236 L460 300 Z" fill="#C9A36F"/>` +
    // tape
    `<path d="M380 238 L460 282 L460 300 L362 300 Z" fill="#BFA174" opacity="0.9"/>` +
    `<rect x="404" y="300" width="52" height="424" fill="#C2A579"/>` +
    `<rect x="456" y="300" width="24" height="424" fill="#C2A579"/>` +
    // front flap line
    `<path d="M300 396 Q512 356 724 396" fill="none" stroke="#A9854F" stroke-width="8"/>` +
    // edge highlight
    `<path d="M316 318 L316 706" stroke="rgba(255,255,255,0.25)" stroke-width="10" stroke-linecap="round"/>` +
    `</g>`;
  return frame(SHADOW + box);
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

const SOURCES = {
  "category-clothing.png": clothingSvg(),
  "category-jobs.png": jobsSvg(),
  "category-other.png": otherSvg(),
};

const toPng = async (svg, size) =>
  sharp(Buffer.from(svg), { density: 96 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

const toWebp = async (svg, size) =>
  sharp(Buffer.from(svg), { density: 96 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();

console.log("Generating premium category illustrations…");
for (const [file, svg] of Object.entries(SOURCES)) {
  const base = file.replace(/\.png$/, "");
  // Source-of-truth original: 1024 with a white studio backdrop + baked
  // contact shadow (matches the assets/categories-source contract).
  const studioSvg = svg.replace(
    "viewBox=\"0 0 1024 1024\">",
    `viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#FFFFFF"/>`
  );
  out(`assets/categories-source/${file}`, await sharp(Buffer.from(studioSvg)).resize(1024, 1024).png().toBuffer());
  // Served triplet with TRUE alpha (soft contact shadow survives verbatim).
  out(`public/images/categories/${base}.png`, await toPng(svg, 480));
  out(`public/images/categories/${base}.webp`, await toWebp(svg, 240));
  out(`public/images/categories/${base}@2x.webp`, await toWebp(svg, 480));
}

// ---- 8-category contact sheet for the Atlas visual audit -----------------
console.log("Writing 8-category contact sheet…");
await buildContactSheet();
console.log("Done.");

async function buildContactSheet() {
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
  const cols = 4;
  const tile = 300;
  const gap = 24;
  const margin = 40;
  const W = margin * 2 + cols * tile + (cols - 1) * gap;
  const rows = Math.ceil(CATEGORIES.length / cols);
  const H = 120 + rows * (tile + 56) + margin;
  const base = sharp({
    create: { width: W, height: H, channels: 4, background: { r: 243, g: 245, b: 249, alpha: 1 } },
  });
  const composites = [];
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const [file] = CATEGORIES[i];
    const x = margin + (i % cols) * (tile + gap);
    const y = 110 + Math.floor(i / cols) * (tile + 56);
    const img = await sharp(p(`public/images/categories/${file}`))
      .resize(240, 240, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: img, left: x + (tile - 240) / 2, top: y });
  }
  // Labels as a text-only SVG overlay (sans-serif, system-rendered).
  let labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="${margin}" y="70" font-family="sans-serif" font-size="30" font-weight="700" fill="#0B1220">VAUTO — 8 kategorijų premium iliustracijos</text>`;
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const x = margin + (i % cols) * (tile + gap) + tile / 2;
    const y = 110 + Math.floor(i / cols) * (tile + 56) + 240 + 34;
    labelSvg += `<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#3A4558">${CATEGORIES[i][1]}</text>`;
  }
  labelSvg += `</svg>`;
  const labels = await sharp(Buffer.from(labelSvg)).png().toBuffer();
  composites.push({ input: labels, left: 0, top: 0 });
  out("docs/categories/vauto-8-categories.png", await base.composite(composites).png().toBuffer());
}
