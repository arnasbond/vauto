/**
 * Process the VAUTO-owned hero atmosphere source photographs into optimized,
 * theme-specific WebP assets for `HomeHeroAtmosphere`.
 *
 * Source: `assets/hero-atmosphere-{light,dark}-raw.png` — AI-generated,
 * VAUTO-owned photorealistic plates (no third-party stock, no unclear
 * licensing/provenance, no real recognizable landmark).
 *
 * Output: `public/images/hero/hero-atmosphere-{light,dark}.webp` — a single
 * asset per theme, cropped to the hero atmosphere panel's rendered aspect
 * ratio (~1.45:1) and sized at 1200px wide (crisp at the panel's ~614px CSS
 * width even at DPR2, since 1200 > 614*2). Deliberately NOT split into
 * separate 1x/2x files: at this compression the single asset is only
 * ~10-25KB, so serving the DPR2-quality file universally costs a few KB on
 * DPR1 screens and avoids `image-set()` fallback complexity entirely — a
 * simpler, still fully audited, performance trade-off. A light softening
 * blur is applied so the plate reads as background atmosphere rather than a
 * crisp foreground photograph.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = "assets";
const OUT_DIR = "public/images/hero";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Matches the panel's rendered box (h-[27rem] against ~48% of the
// ~80rem/1280px desktop content max-width) across the breakpoints where the
// panel is visible (sm+).
const TARGET_ASPECT = 1.45;

const PLATES = [
  {
    theme: "light",
    src: path.join(SRC_DIR, "hero-atmosphere-light-raw.png"),
    blurSigma: 0.8,
    saturation: 0.9,
  },
  {
    theme: "dark",
    src: path.join(SRC_DIR, "hero-atmosphere-dark-raw.png"),
    blurSigma: 1.0,
    saturation: 0.95,
  },
];

const SIZES = [{ suffix: "", width: 1200 }];

async function run() {
  for (const plate of PLATES) {
    const meta = await sharp(plate.src).metadata();
    const srcW = meta.width;
    const srcH = meta.height;
    // Crop to TARGET_ASPECT from the source, biased toward the bottom so the
    // rooftop/tower line stays comfortably in frame and the (larger) sky
    // area is what gets trimmed first.
    let cropW = srcW;
    let cropH = Math.round(srcW / TARGET_ASPECT);
    if (cropH > srcH) {
      cropH = srcH;
      cropW = Math.round(srcH * TARGET_ASPECT);
    }

    for (const size of SIZES) {
      const height = Math.round(size.width / TARGET_ASPECT);
      const outPath = path.join(OUT_DIR, `hero-atmosphere-${plate.theme}${size.suffix}.webp`);
      await sharp(plate.src)
        .resize(cropW, cropH, { fit: "cover", position: "bottom" })
        .resize(size.width, height, { fit: "fill" })
        .modulate({ saturation: plate.saturation })
        .blur(plate.blurSigma)
        .webp({ quality: 74 })
        .toFile(outPath);
      const stat = fs.statSync(outPath);
      console.log(
        `wrote ${outPath} (${size.width}x${height}, ${(stat.size / 1024).toFixed(1)}KB)`
      );
    }
  }
}

run();
