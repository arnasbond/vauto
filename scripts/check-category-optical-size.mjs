/**
 * F7 Premium Category Imagery — optical-size audit.
 *
 * Measures the non-transparent fill ratio of every served category PNG and
 * compares the three F7 additions (Mada / Darbas / Kita) against the median
 * of the five existing photorealistic objects (Transportas, NT, Elektronika,
 * Namai, Paslaugos). Atlas requires the new objects to occupy a comparable
 * share of the tile — no large empty margins and no dwarfed objects.
 *
 * Exit code 1 when a new asset deviates from the median by more than the
 * tolerance (fail-closed: the flat procedural stand-ins are EXPECTED to fail
 * until real premium rasters land — see docs/categories/ASSET-REQUIREMENTS.md).
 */
import sharp from "sharp";

const EXISTING = [
  "category-transport.png",
  "category-real-estate.png",
  "category-electronics.png",
  "category-home-garden.png",
  "category-services.png",
];
const NEW = ["category-clothing.png", "category-jobs.png", "category-other.png"];
const TOLERANCE = 0.15; // absolute fill-ratio deviation allowed vs median

async function fillRatio(file) {
  const { data, info } = await sharp(`public/images/categories/${file}`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let opaque = 0;
  const total = info.width * info.height;
  for (let i = 0; i < total; i += 1) {
    if (data[i * channels + 3] > 8) opaque += 1;
  }
  return opaque / total;
}

const existing = [];
for (const f of EXISTING) existing.push(await fillRatio(f));
existing.sort((a, b) => a - b);
const median = existing[2];
console.log(
  "existing fill ratios:",
  EXISTING.map((f, i) => `${f}=${existing[i].toFixed(3)}`).join(", ")
);
console.log(`median of existing: ${median.toFixed(3)}`);

let failed = false;
for (const f of NEW) {
  const ratio = await fillRatio(f);
  const deviation = Math.abs(ratio - median);
  const ok = deviation <= TOLERANCE;
  if (!ok) failed = true;
  console.log(
    `${f}: fill=${ratio.toFixed(3)} deviation=${deviation.toFixed(3)} ${ok ? "OK" : "FAIL"}`
  );
}

if (failed) {
  console.error(
    "\nOptical-size audit FAILED: the new assets do not match the existing premium objects yet."
  );
  console.error(
    "Replace them with real photorealistic renders per docs/categories/ASSET-REQUIREMENTS.md"
  );
  process.exit(1);
}
console.log("\nOptical-size audit passed.");
