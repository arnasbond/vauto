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
import {
  BRAND,
  MARK_COLORS,
  MARK_SURFACES,
  iconSvg,
  lockupSvg,
  markMonoSvg,
  markSvg,
  ogComposition,
} from "./brand-geometry.mjs";
import { buildOgSvg, buildSheetSvg } from "./brand-compositions.mjs";

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

// 10. SVG bounds: every element + stroke fits the declared viewBox ----------------
{
  const parseViewBox = (svg) => {
    const m = svg.match(/viewBox="([^"]+)"/);
    if (!m) return null;
    const [x, y, w, h] = m[1].trim().split(/\s+/).map(Number);
    return { x, y, w, h };
  };
  /** Command-aware path bounds (M/L/H/V/Q/Z tokens, no naive number pairing). */
  const pathBounds = (d) => {
    let x = 0, y = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const upd = (nx, ny) => {
      x = nx; y = ny;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let cmd = null;
    for (let i = 0; i < toks.length; ) {
      const t = toks[i];
      if (/^[A-Za-z]$/.test(t)) {
        cmd = t;
        i += 1;
        continue;
      }
      const num = () => Number(toks[i++]);
      switch (cmd) {
        case "M":
        case "L":
          upd(num(), num());
          break;
        case "H":
          upd(num(), y);
          break;
        case "V":
          upd(x, num());
          break;
        case "Q":
        case "C": {
          num(); num(); // control point(s)
          upd(num(), num());
          break;
        }
        case "Z":
          i += 1;
          break;
        default:
          i += 1;
      }
    }
    return { minX, minY, maxX, maxY };
  };
  const svgBounds = (svg) => {
    const vb = parseViewBox(svg);
    if (!vb) return { ok: false, reason: "no viewBox" };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const stack = [{ tx: 0, ty: 0, s: 1 }];
    const apply = (x, y, sw = 0) => {
      const t = stack[stack.length - 1];
      const X = t.tx + x * t.s;
      const Y = t.ty + y * t.s;
      const pad = (sw * t.s) / 2;
      minX = Math.min(minX, X - pad); minY = Math.min(minY, Y - pad);
      maxX = Math.max(maxX, X + pad); maxY = Math.max(maxY, Y + pad);
    };
    const numbers = (s2) => [...s2.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const tagRe = /<(g|rect|polygon|path|circle)\b([^>]*?)(\/?)>/g;
    let lastIndex = 0;
    for (const m of svg.matchAll(tagRe)) {
      const [full, tag, attrs, selfClose] = m;
      if (m.index > lastIndex) {
        // Pop a transform frame for every closing </g> since the last tag.
        const closes = svg.slice(lastIndex, m.index).match(/<\/g>/g) ?? [];
        for (let ci = 0; ci < closes.length; ci += 1) {
          if (stack.length > 1) stack.pop();
        }
      }
      lastIndex = m.index + full.length;
      if (tag === "g") {
        const t = attrs.match(/transform="([^"]+)"/);
        const tr = stack[stack.length - 1];
        let tx = tr.tx, ty = tr.ty, s = tr.s;
        if (t) {
          const tm = t[1].match(/translate\(([^)]+)\)/);
          if (tm) {
            const [a, b] = tm[1].split(/[,\s]+/).map(Number);
            tx = tr.tx + (a || 0) * tr.s;
            ty = tr.ty + (b || 0) * tr.s;
          }
          const sm = t[1].match(/scale\(([^)]+)\)/);
          if (sm) s = tr.s * Number(sm[1]);
        }
        if (!selfClose) stack.push({ tx, ty, s });
        continue;
      }
      const sw = Number(attrs.match(/stroke-width="([^"]+)"/)?.[1] ?? 0);
      if (tag === "rect") {
        const x = Number(attrs.match(/x="([^"]+)"/)?.[1] ?? 0);
        const y = Number(attrs.match(/y="([^"]+)"/)?.[1] ?? 0);
        const w = Number(attrs.match(/width="([^"]+)"/)?.[1] ?? 0);
        const h = Number(attrs.match(/height="([^"]+)"/)?.[1] ?? 0);
        apply(x, y, sw); apply(x + w, y + h, sw);
        continue;
      }
      if (tag === "polygon") {
        const pts = numbers(attrs.match(/points="([^"]+)"/)?.[1] ?? "");
        for (let i = 0; i + 1 < pts.length; i += 2) apply(pts[i], pts[i + 1], sw);
        continue;
      }
      if (tag === "circle") {
        const cx = Number(attrs.match(/cx="([^"]+)"/)?.[1] ?? 0);
        const cy = Number(attrs.match(/cy="([^"]+)"/)?.[1] ?? 0);
        const r = Number(attrs.match(/r="([^"]+)"/)?.[1] ?? 0);
        apply(cx - r, cy - r, sw); apply(cx + r, cy + r, sw);
        continue;
      }
      if (tag === "path") {
        const b = pathBounds(attrs.match(/d="([^"]+)"/)?.[1] ?? "");
        if (Number.isFinite(b.minX)) {
          apply(b.minX, b.minY, sw);
          apply(b.maxX, b.maxY, sw);
        }
        continue;
      }
    }
    const tol = 0.6;
    if (minX < vb.x - tol || minY < vb.y - tol || maxX > vb.x + vb.w + tol || maxY > vb.y + vb.h + tol) {
      return { ok: false, reason: `bounds [${minX},${minY},${maxX},${maxY}] outside viewBox [${vb.x},${vb.y},${vb.w},${vb.h}]` };
    }
    return { ok: true };
  };
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
    const res = svgBounds(svgFile(rel));
    check(res.ok, `${rel} elements fit the viewBox (${res.ok ? "ok" : res.reason})`);
  }
}

// 11. Standalone mark contrast against its declared surface ------------------------
{
  const lum = (hex) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  };
  for (const key of ["light", "dark"]) {
    const surface = MARK_SURFACES[key];
    for (const half of [MARK_COLORS[key].a, MARK_COLORS[key].b]) {
      const r = ratio(half, surface);
      check(r >= 3, `mark ${key} half ${half} on ${surface} contrast ${r.toFixed(2)}:1 ≥ 3:1`);
    }
  }
}

// 12. No U+FFFD in metadata / generated text ----------------------------------------
{
  for (const rel of [
    "src/app/layout.tsx",
    "public/manifest.json",
    "assets/brand/vauto-lockup.svg",
    "assets/brand/vauto-lockup-dark.svg",
    "assets/brand/vauto-mark.svg",
    "assets/brand/vauto-mark-dark.svg",
  ]) {
    const text = readFileSync(p(rel), "utf8");
    check(!text.includes("\uFFFD"), `${rel} has no U+FFFD replacement characters`);
  }
}

// 13. OG: separate, non-overlapping mark and wordmark --------------------------------
{
  const comp = ogComposition();
  const noOverlap =
    comp.mark.x >= 0 && comp.mark.y >= 0 &&
    comp.mark.x + comp.mark.w <= 1200 && comp.mark.y + comp.mark.h <= 630 &&
    comp.word.x >= 0 && comp.word.y >= 0 &&
    comp.word.x + comp.word.w <= 1200 && comp.word.y + comp.word.h <= 630 &&
    comp.mark.y + comp.mark.h <= comp.word.y;
  check(noOverlap, "OG mark and wordmark are inside the canvas and do not overlap");
  const og = await sharp(p("public/og-1200x630.png"));
  const meta = await og.metadata();
  check(meta.width === 1200 && meta.height === 630, "OG PNG is really 1200x630");
  // Pixel proof: the row between the mark bottom and the wordmark top is pure
  // navy (no overlap), and the wordmark stroke is present below it.
  const { data: raw, info } = await og.raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
  const gapY = Math.round(comp.mark.y + comp.mark.h + 8);
  const gap = at(600, gapY);
  check(gap[0] === 11 && gap[1] === 18 && gap[2] === 32, `OG gap row (y=${gapY}) is navy — no overlap`);
  const strokeY = Math.round(comp.word.y + (72 * (comp.word.w / 224)) / 2);
  const stroke = at(Math.round(comp.word.x + 0.35 * comp.word.w), strokeY);
  check(stroke[0] > 200 && stroke[1] > 200 && stroke[2] > 200, "OG wordmark stroke is visible");
}

// 14. Generator idempotency: regenerated outputs equal committed files ----------------
{
  const expected = {
    "assets/brand/vauto-mark.svg": markSvg(MARK_COLORS.light),
    "assets/brand/vauto-mark-dark.svg": markSvg(MARK_COLORS.dark),
    "assets/brand/vauto-icon.svg": iconSvg({ bg: BRAND.navy, a: BRAND.white, b: BRAND.emeraldLight }),
    "assets/brand/vauto-icon-maskable.svg": iconSvg({ bg: BRAND.navy, a: BRAND.white, b: BRAND.emeraldLight, maskable: true, bleed: true }),
    "assets/brand/vauto-mark-mono.svg": markMonoSvg(BRAND.white),
    "assets/brand/vauto-lockup.svg": lockupSvg({ bg: BRAND.navy, iconA: BRAND.white, iconB: BRAND.emeraldLight, text: BRAND.navy }),
    "assets/brand/vauto-lockup-dark.svg": lockupSvg({ bg: BRAND.navy, iconA: BRAND.white, iconB: BRAND.emeraldDark, text: BRAND.white }),
    "assets/brand/vauto-og.svg": buildOgSvg(),
    "docs/branding/vauto-brand-contact-sheet.svg": buildSheetSvg(),
  };
  for (const [rel, svg] of Object.entries(expected)) {
    check(readFileSync(p(rel), "utf8") === svg, `${rel} matches the canonical generator output (no drift)`);
  }

  // Bitmap idempotency: regenerate two key PNGs in memory and byte-compare.
  const renderPng = async (svg, size) =>
    sharp(Buffer.from(svg), { density: 96 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  const ogRegen = await sharp(Buffer.from(buildOgSvg()), { density: 96 })
    .resize(1200, 630, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  check(
    ogRegen.equals(readFileSync(p("public/og-1200x630.png"))),
    "OG PNG regeneration is byte-identical (generator has no drift)"
  );
  const iconRegen = await renderPng(
    iconSvg({ bg: BRAND.navy, a: BRAND.white, b: BRAND.emeraldLight }),
    192
  );
  check(
    iconRegen.equals(readFileSync(p("public/icon-192.png"))),
    "icon-192 PNG regeneration is byte-identical (generator has no drift)"
  );
}

if (failures > 0) {
  console.error(`\n${failures} branding checks FAILED.`);
  process.exit(1);
}
console.log("\nAll branding checks passed.");
