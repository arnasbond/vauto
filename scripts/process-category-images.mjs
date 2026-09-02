// Category object-illustration asset pipeline.
//
// Source-of-truth originals: assets/categories-source/*.png
// (VAUTO-owned, photorealistic/3D-rendered dimensional product-style object
// photography — generic fictional designs, no third-party brand marks —
// generated on a plain studio-white background with a soft contact shadow).
//
// This script removes ONLY the background: near-white/near-gray pixels are
// flood-filled starting from the four image borders, so enclosed near-white
// regions that are part of the object itself (e.g. light house siding) are
// preserved even though they fall in the same brightness range as the
// studio backdrop. The cut edge is feathered (blurred alpha) for smooth
// anti-aliasing against both LIGHT and DARK card backgrounds, then trimmed
// to content and emitted as the served triplet consumed by
// HomeCategoryGrid.tsx:
//   public/images/categories/<name>.webp      (240px, 1x)
//   public/images/categories/<name>@2x.webp   (480px, 2x / retina)
//   public/images/categories/<name>.png       (480px, PNG fallback)
//
// Re-run this script whenever assets/categories-source/*.png changes.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve("assets", "categories-source");
const OUT_DIR = path.resolve("public", "images", "categories");
const WORK_SIZE = 1024;
// Lowered from 197→150 (and delta 14→20): the AI-rendered studio contact
// shadows fade through a wide near-neutral gray band (observed ~150-247)
// before reaching pure white. At 197 the flood fill only consumed the
// outermost, lightest part of that gradient, leaving a jagged/uneven
// partial-shadow residue wherever the gradient crossed the threshold
// unevenly (most visible under the "Darbas" chair's five wheels). At 150
// the full gradient is consumed cleanly while remaining well above the
// darkest object pixels sampled across all six sources (wheels/plastic/
// keyboard/roof ~13-95), so real object detail is not eaten.
const BG_THRESHOLD = 150; // min RGB channel to be considered studio white/soft-shadow
const BG_MAX_DELTA = 20; // max channel spread (keeps keying to near-neutral gray/white only)

export const CATEGORY_IMAGE_FILES = [
  "category-transport.png",
  "category-real-estate.png",
  "category-electronics.png",
  "category-services.png",
  "category-jobs.png",
  "category-home-garden.png",
  "category-clothing.png",
  "category-other.png",
];

function isBackgroundLike(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= BG_THRESHOLD && max - min <= BG_MAX_DELTA;
}

/** Flood-fill background-colored pixels connected to the image border only. */
function floodFillBackgroundMask(data, width, height, channels) {
  const bg = new Uint8Array(width * height); // 1 = background
  const visited = new Uint8Array(width * height);
  const stack = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    const p = idx * channels;
    if (isBackgroundLike(data[p], data[p + 1], data[p + 2])) {
      bg[idx] = 1;
      stack.push(x, y);
    }
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return bg;
}

function applyMaskToAlpha(data, width, height, channels, bgMask) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const s = i * channels;
    out[p] = data[s];
    out[p + 1] = data[s + 1];
    out[p + 2] = data[s + 2];
    out[p + 3] = bgMask[i] ? 0 : 255;
  }
  return out;
}

async function processOne(file) {
  const srcPath = path.join(SRC_DIR, file);
  const base = file.replace(/\.png$/, "");

  const { data, info } = await sharp(srcPath)
    .resize(WORK_SIZE, WORK_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bgMask = floodFillBackgroundMask(data, info.width, info.height, info.channels);
  const rgba = applyMaskToAlpha(data, info.width, info.height, info.channels, bgMask);

  // Feather the cut edge: slightly blur just the alpha channel so the
  // silhouette doesn't have a hard aliased edge against card backgrounds.
  const rgbOnly = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .removeAlpha()
    .raw()
    .toBuffer();

  const alphaBlurred = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .ensureAlpha()
    .extractChannel(3)
    .blur(1.1)
    .raw()
    .toBuffer();

  // Must round-trip through an encoded container (PNG) before .trim() —
  // sharp's trim() does not reliably compute bounding boxes on images
  // constructed directly from raw buffers.
  const joinedPng = await sharp(rgbOnly, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .joinChannel(alphaBlurred, {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
    .png()
    .toBuffer();

  const pipeline = sharp(joinedPng).trim({ threshold: 8 });

  await pipeline
    .clone()
    .resize({ width: 480, height: 480, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, `${base}.png`));

  await pipeline
    .clone()
    .resize({ width: 480, height: 480, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(path.join(OUT_DIR, `${base}@2x.webp`));

  await pipeline
    .clone()
    .resize({ width: 240, height: 240, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(path.join(OUT_DIR, `${base}.webp`));

  console.log(`[process-category-images] processed ${file}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // Optional CLI filter: node scripts/process-category-images.mjs category-clothing.png ...
  const targets =
    process.argv.slice(2).length > 0 ? process.argv.slice(2) : CATEGORY_IMAGE_FILES;
  for (const f of targets) {
    await processOne(f);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
