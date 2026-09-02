/**
 * F7 Branding Closure — deterministic asset generator.
 *
 * Rasterizes the canonical SVG geometry (scripts/brand/brand-geometry.mjs)
 * into every Web/PWA/Android/iOS bitmap with sharp (already a repo dep).
 * Run: node scripts/brand/generate-brand-assets.mjs
 * Verify: node scripts/brand/verify-brand-assets.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BRAND,
  MARK_COLORS,
  iconSvg,
  lockupSvg,
  markMonoSvg,
  markSvg,
} from "./brand-geometry.mjs";
import { buildOgSvg, buildSheetSvg } from "./brand-compositions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const out = (rel, buf) => {
  const p = path.join(ROOT, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, buf);
  console.log(`  ${rel} (${buf.length} B)`);
};

const png = async (svg, size) =>
  sharp(Buffer.from(svg), { density: 96 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

const pngExact = (svg, w, h) =>
  sharp(Buffer.from(svg), { density: 96 })
    .resize(w, h, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();

// ---- canonical SVGs (committed assets) -------------------------------
// Standalone marks: LIGHT file is for a WHITE surface, DARK file for NAVY.
const markLight = markSvg(MARK_COLORS.light);
const markDark = markSvg(MARK_COLORS.dark);
const iconAny = iconSvg({ bg: BRAND.navy, a: BRAND.white, b: BRAND.emeraldLight });
const iconMaskable = iconSvg({
  bg: BRAND.navy,
  a: BRAND.white,
  b: BRAND.emeraldLight,
  maskable: true,
  bleed: true,
});
const monoWhite = markMonoSvg(BRAND.white);
const lockupLight = lockupSvg({
  bg: BRAND.navy,
  iconA: BRAND.white,
  iconB: BRAND.emeraldLight,
  text: BRAND.navy,
});
const lockupDark = lockupSvg({
  bg: BRAND.navy,
  iconA: BRAND.white,
  iconB: BRAND.emeraldDark,
  text: BRAND.white,
});

console.log("Writing canonical SVG sources…");
out("assets/brand/vauto-mark.svg", Buffer.from(markLight));
out("assets/brand/vauto-mark-dark.svg", Buffer.from(markDark));
out("assets/brand/vauto-icon.svg", Buffer.from(iconAny));
out("assets/brand/vauto-icon-maskable.svg", Buffer.from(iconMaskable));
out("assets/brand/vauto-mark-mono.svg", Buffer.from(monoWhite));
out("assets/brand/vauto-lockup.svg", Buffer.from(lockupLight));
out("assets/brand/vauto-lockup-dark.svg", Buffer.from(lockupDark));

// ---- Web / PWA --------------------------------------------------------
console.log("Writing Web/PWA bitmaps…");
out("public/icon.svg", Buffer.from(iconAny));
out("public/icon-192.png", await png(iconAny, 192));
out("public/icon-512.png", await png(iconAny, 512));
out("public/icon-maskable-192.png", await png(iconMaskable, 192));
out("public/icon-maskable-512.png", await png(iconMaskable, 512));
out("public/apple-touch-icon.png", await png(iconAny, 180));

const favSizes = [16, 32, 48];
const favPngs = [];
for (const s of favSizes) favPngs.push(await png(iconAny, s));
out("public/favicon.ico", packIco(favSizes, favPngs));

// OG 1200x630: flat navy plate, V mark + geometric wordmark.
const ogSvg = buildOgSvg();
out("assets/brand/vauto-og.svg", Buffer.from(ogSvg));
out("public/og-1200x630.png", await pngExact(ogSvg, 1200, 630));

// ---- Android ----------------------------------------------------------
console.log("Writing Android assets…");
const DENSITIES = [
  ["ldpi", 0.75],
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];
for (const [name, factor] of DENSITIES) {
  const legacy = Math.round(48 * factor);
  const fg = Math.round(108 * factor);
  out(
    `android/app/src/main/res/mipmap-${name}/ic_launcher.png`,
    await png(iconAny, legacy)
  );
  out(
    `android/app/src/main/res/mipmap-${name}/ic_launcher_round.png`,
    await png(iconAny, legacy)
  );
  out(
    `android/app/src/main/res/mipmap-${name}/ic_launcher_foreground.png`,
    await png(iconAny, fg)
  );
  out(
    `android/app/src/main/res/drawable-${name}/ic_stat_vauto.png`,
    await png(monoWhite, Math.round(24 * factor))
  );
}

// ---- iOS --------------------------------------------------------------
console.log("Writing iOS assets…");
out(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  await png(
    iconSvg({ bg: BRAND.navy, a: BRAND.white, b: BRAND.emeraldLight, bleed: true }),
    1024
  )
);
const splashSvg = iconSvg({
  bg: BRAND.navy,
  a: BRAND.white,
  b: BRAND.emeraldLight,
  maskable: true,
  bleed: true,
});
out(
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
  await png(splashSvg, 2732)
);
out(
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
  await png(splashSvg, 2732)
);
out(
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png",
  await png(splashSvg, 1366)
);

// Android splash drawable (Capacitor uses drawable/splash.png, 192dp icon).
out("android/app/src/main/res/drawable/splash.png", await png(iconMaskable, 192));

// ---- Contact sheet for the Atlas brand audit --------------------------
console.log("Writing brand contact sheet…");
const sheetSvg = buildSheetSvg();
out("docs/branding/vauto-brand-contact-sheet.svg", Buffer.from(sheetSvg));
out("docs/branding/vauto-brand-contact-sheet.png", await pngExact(sheetSvg, 1280, 900));

console.log("Done.");

/** Minimal ICO container: PNG-compressed entries for the given sizes. */
function packIco(sizes, pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  pngs.forEach((buf, i) => {
    const size = sizes[i];
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = e[0];
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}
