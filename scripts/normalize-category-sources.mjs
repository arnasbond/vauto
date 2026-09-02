/**
 * F7 Premium Category Imagery — deterministic source normalization.
 *
 * Atlas delivered the three photorealistic sources at 1254×1254; the repo
 * contract for assets/categories-source is 1024×1024. This resizes them
 * losslessly-with-sharp (square → square, no cropping, no content change)
 * and reports the before/after geometry.
 */
import sharp from "sharp";

const FILES = [
  "assets/categories-source/category-clothing.png",
  "assets/categories-source/category-jobs.png",
  "assets/categories-source/category-other.png",
];

for (const file of FILES) {
  const before = await sharp(file).metadata();
  await sharp(file)
    .resize(1024, 1024, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(`${file}.resized`);
  const after = await sharp(`${file}.resized`).metadata();
  console.log(
    `${file}: ${before.width}x${before.height} → ${after.width}x${after.height}`
  );
  const { renameSync } = await import("node:fs");
  renameSync(`${file}.resized`, file);
}
console.log("Done.");
