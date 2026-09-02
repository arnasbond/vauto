/**
 * F7 Branding Closure — asset verification.
 *
 * Deterministic checks over the GENERATED branding files:
 *  - exact bitmap sizes (Web/PWA/Android/iOS);
 *  - SVG validity (no scripts/images/foreignObject/gradients/forbidden colors);
 *  - iOS icon has NO alpha;
 *  - maskable safe-zone contract (corners = background, mark inside center);
 *  - Android notification icon monochrome (transparent + white only);
 *  - forbidden legacy colors (#1B4DFF, #FF5722, #FF7A1A, #00BFA5) absent;
 *  - manifest / layout / service-worker references exist.
 *
 * Run: node scripts/brand/verify-brand-assets.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BRAND } from "./brand-geometry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const p = (...rel) => path.join(ROOT, ...rel);

let failures = 0;
const check = (cond, label) => {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
};

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

async function rawPng(file) {
  const { data, info } = await sharp(file)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function pixelAt(file, x, y) {
  const { data, info } = await rawPng(file);
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3] ?? 255];
}

async function uniqueColors(file, maxSamples = 200000) {
  const { data, info } = await rawPng(file);
  const step = Math.max(1, Math.floor((data.length / info.channels) / maxSamples));
  const set = new Set();
  for (let i = 0; i < data.length; i += info.channels * step) {
    set.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3] ?? 255}`);
  }
  return set;
}

const svgFile = (rel) => readFileSync(p(rel), "utf8");

console.log("Branding verification");

// 1. Exact bitmap sizes ----------------------------------------------------
const SIZES = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/icon-maskable-192.png", 192],
  ["public/icon-maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
  ["public/og-1200x630.png", null, 1200, 630],
  ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024],
  ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", 2732],
];
for (const [rel, size, w, h] of SIZES) {
  const meta = await sharp(p(rel)).metadata();
  check(
    meta.width === (w ?? size) && meta.height === (h ?? size),
    `${rel} is ${w ?? size}x${h ?? size}`
  );
}

const ANDROID = [
  ["ldpi", 36],
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
for (const [name, legacy] of ANDROID) {
  const meta = await sharp(p(`android/app/src/main/res/mipmap-${name}/ic_launcher.png`)).metadata();
  check(meta.width === legacy, `android ${name} launcher is ${legacy}px`);
  const fg = await sharp(p(`android/app/src/main/res/mipmap-${name}/ic_launcher_foreground.png`)).metadata();
  const fgExpect = Math.round(108 * ({ ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })[name]);
  check(fg.width === fgExpect, `android ${name} adaptive foreground is ${fgExpect}px`);
}

// 2. favicon.ico entries ----------------------------------------------------
const ico = readFileSync(p("public/favicon.ico"));
const icoCount = ico.readUInt16LE(4);
check(icoCount === 3, "favicon.ico has 3 entries");
check(ico[6] === 16 && ico[6 + 16] === 32 && ico[6 + 32] === 48, "favicon.ico sizes 16/32/48");

// 3. SVG validity + forbidden constructs -------------------------------------
for (const rel of [
  "public/icon.svg",
  "assets/brand/vauto-icon.svg",
  "assets/brand/vauto-icon-maskable.svg",
  "assets/brand/vauto-mark.svg",
  "assets/brand/vauto-mark-dark.svg",
  "assets/brand/vauto-mark-mono.svg",
  "assets/brand/vauto-lockup.svg",
  "assets/brand/vauto-lockup-dark.svg",
]) {
  const svg = svgFile(rel);
  check(svg.includes("viewBox"), `${rel} has viewBox`);
  check(
    !/<script|foreignObject|<image|linearGradient|radialGradient/i.test(svg),
    `${rel} has no scripts/bitmaps/gradients`
  );
  const upper = svg.toUpperCase();
  check(
    !BRAND.forbidden.some((c) => upper.includes(c.replace("#", ""))),
    `${rel} has no forbidden legacy colors`
  );
}

// 4. iOS icon: no alpha -------------------------------------------------------
{
  const colors = await uniqueColors(p("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
  let opaque = true;
  for (const c of colors) {
    if (Number(c.split(",")[3]) !== 255) opaque = false;
  }
  check(opaque, "iOS AppIcon has no alpha channel");
}

// 5. Maskable safe zone --------------------------------------------------------
for (const rel of ["public/icon-maskable-192.png", "public/icon-maskable-512.png"]) {
  const { info } = await rawPng(p(rel));
  const navy = hexToRgb(BRAND.navy);
  const corner = await pixelAt(p(rel), Math.round(info.width * 0.03), Math.round(info.height * 0.03));
  const edgeTop = await pixelAt(p(rel), Math.round(info.width / 2), Math.round(info.height * 0.04));
  const leftHalf = await pixelAt(p(rel), Math.round(info.width * 0.4), Math.round(info.height * 0.5));
  const rightHalf = await pixelAt(p(rel), Math.round(info.width * 0.55), Math.round(info.height * 0.5));
  const isNavy = (px) => px[0] === navy[0] && px[1] === navy[1] && px[2] === navy[2];
  check(isNavy(corner), `${rel} maskable corner is background`);
  check(isNavy(edgeTop), `${rel} maskable edge is background (safe zone respected)`);
  check(
    leftHalf[0] > 200 && leftHalf[1] > 200 && leftHalf[2] > 200,
    `${rel} white half of the mark is inside the safe zone`
  );
  check(
    rightHalf[1] > 120 && rightHalf[0] < 80 && rightHalf[2] < 130,
    `${rel} emerald half of the mark is inside the safe zone`
  );
}

// 6. Notification icon monochrome -----------------------------------------------
{
  const colors = await uniqueColors(p("android/app/src/main/res/drawable-xxxhdpi/ic_stat_vauto.png"));
  let mono = true;
  for (const c of colors) {
    const [r, g, b, a] = c.split(",").map(Number);
    const transparent = a === 0;
    // White with ANY alpha (anti-aliased edges) is still monochrome.
    const whiteShade = r === g && g === b && r > 0;
    if (!transparent && !whiteShade) mono = false;
  }
  check(mono, "android notification icon is monochrome (white + transparent)");
}

// 7. Forbidden colors across ACTIVE branding bitmaps -----------------------------
{
  const targets = [
    "public/icon.svg",
    "public/icon-192.png",
    "public/icon-512.png",
    "public/icon-maskable-192.png",
    "public/icon-maskable-512.png",
    "public/apple-touch-icon.png",
    "public/favicon.ico",
    "public/og-1200x630.png",
    "android/app/src/main/res/drawable/splash.png",
    "android/app/src/main/res/values/ic_launcher_background.xml",
    "android/app/src/main/res/drawable/splash_screen.xml",
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  ];
  for (const rel of targets) {
    const raw = readFileSync(p(rel));
    const ascii = raw.toString("latin1").toUpperCase();
    const found = BRAND.forbidden.filter((c) => ascii.includes(c.replace("#", "")));
    check(found.length === 0, `${rel} contains no legacy colors (${found.join(",") || "none"})`);
  }
  const splashXml = readFileSync(p("android/app/src/main/res/drawable/splash_screen.xml"), "utf8");
  check(!/gradient/i.test(splashXml), "android splash has no gradient");
}

// 8. References ---------------------------------------------------------------
{
  const manifest = JSON.parse(readFileSync(p("public/manifest.json"), "utf8"));
  check(manifest.short_name === "VAUTO", "manifest short_name = VAUTO");
  check(manifest.theme_color === "#0B1220" && manifest.background_color === "#0B1220", "manifest navy theme/background");
  const purposes = manifest.icons.flatMap((i) => (i.purpose ?? "").split(/\s+/));
  check(purposes.includes("maskable"), "manifest declares maskable icons");
  check(purposes.includes("any"), "manifest declares any icons");
  for (const icon of manifest.icons) {
    check(existsSync(p("public", icon.src.replace(/^\//, ""))), `manifest icon exists: ${icon.src}`);
  }

  const layout = readFileSync(p("src/app/layout.tsx"), "utf8");
  check(layout.includes("favicon.ico"), "layout references favicon.ico");
  check(layout.includes("apple-touch-icon.png"), "layout references apple-touch-icon 180");
  check(layout.includes("og-1200x630.png"), "layout references brand OG image");
  check(layout.includes('themeColor: "#0B1220"'), "layout themeColor = navy");

  const sw = readFileSync(p("public/sw.js"), "utf8");
  for (const icon of ["/icon-192.png", "/icon-512.png"]) {
    check(sw.includes(icon), `service worker references ${icon}`);
  }

  const colorsXml = readFileSync(p("android/app/src/main/res/values/ic_launcher_background.xml"), "utf8");
  check(colorsXml.includes("#0B1220"), "android launcher background color = navy");
  check(!colorsXml.includes("#1B4DFF") && !colorsXml.includes("#FF7A1A"), "android colors.xml has no legacy colors");
}

// 9. Legacy assets removed -------------------------------------------------------
check(!existsSync(p("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml")), "legacy orange foreground vector removed");
check(!existsSync(p("android/app/src/main/res/drawable/ic_launcher_background.xml")), "legacy teal background vector removed");
check(!existsSync(p("src/components/VautoLogo.tsx")), "dead VautoLogo removed");
check(!existsSync(p("src/components/VautoHexMark.tsx")), "dead VautoHexMark removed");

if (failures > 0) {
  console.error(`\n${failures} branding checks FAILED.`);
  process.exit(1);
}
console.log("\nAll branding checks passed.");
