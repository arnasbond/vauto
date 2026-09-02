/**
 * F7 Branding Closure — pure compositions (OG image + contact sheet).
 * Both derive ONLY from brand-geometry.mjs so the generator and the
 * verification script can reproduce them byte-for-byte.
 */
import {
  BRAND,
  MARK_COLORS,
  MARK_HALF_A,
  MARK_HALF_B,
  iconSvg,
  lockupSvg,
  ogComposition,
  wordmarkSvg,
} from "./brand-geometry.mjs";

const stripSvg = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

export function buildOgSvg() {
  // Vertically stacked, centered, NON-overlapping: mark on top, wordmark
  // below, with declared safe margins (see ogComposition).
  const c = ogComposition();
  const inner = stripSvg(wordmarkSvg("#FFFFFF"));
  const markScale = c.mark.w / 96;
  const wordScale = c.word.w / 224;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="${BRAND.navy}"/>` +
    `<g transform="translate(${c.mark.x} ${c.mark.y}) scale(${markScale})">` +
    `<polygon points="${MARK_HALF_A}" fill="${BRAND.white}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${BRAND.emeraldLight}"/>` +
    `</g>` +
    `<g transform="translate(${c.word.x} ${c.word.y}) scale(${wordScale})">${inner}</g>` +
    `</svg>`
  );
}

export function buildSheetSvg() {
  const iconInner = stripSvg(
    iconSvg({ bg: BRAND.navy, a: "#FFFFFF", b: "#10B981" })
  );
  const maskableInner = stripSvg(
    iconSvg({ bg: BRAND.navy, a: "#FFFFFF", b: "#10B981", maskable: true, bleed: true })
  );
  const lockupLightInner = stripSvg(
    lockupSvg({
      bg: BRAND.navy,
      iconA: BRAND.white,
      iconB: BRAND.emeraldLight,
      text: BRAND.navy,
    })
  );
  const lockupDarkInner = stripSvg(
    lockupSvg({
      bg: BRAND.navy,
      iconA: BRAND.white,
      iconB: BRAND.emeraldDark,
      text: BRAND.white,
    })
  );
  const markLightInner =
    `<polygon points="${MARK_HALF_A}" fill="${MARK_COLORS.light.a}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${MARK_COLORS.light.b}"/>`;
  const markDarkInner =
    `<polygon points="${MARK_HALF_A}" fill="${MARK_COLORS.dark.a}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${MARK_COLORS.dark.b}"/>`;

  const parts = [];
  const card = (x, y, w, h, bg, stroke = "#D7DFEB") =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${bg}" stroke="${stroke}"/></g>`;
  const label = (x, y, text) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#5B6578">${text}</text>`;

  parts.push(
    `<rect width="1280" height="900" fill="#F3F5F9"/>`,
    `<text x="40" y="52" font-family="sans-serif" font-size="26" font-weight="700" fill="#0B1220">VAUTO brand — F7 canonical set</text>`
  );

  // Row 1: mark light / mark dark / app icon / maskable
  const r1y = 84;
  const r1h = 200;
  const r1w = 250;
  const gap = 26;
  let x = 40;
  parts.push(card(x, r1y, r1w, r1h, "#FFFFFF"));
  parts.push(
    `<g transform="translate(${x + (r1w - 96 * 2.0) / 2} ${r1y + (r1h - 72 * 2.0) / 2}) scale(2.0)">${markLightInner}</g>`,
    label(x + r1w / 2, r1y + r1h + 22, "V mark (light) — white surface")
  );
  x += r1w + gap;
  parts.push(card(x, r1y, r1w, r1h, BRAND.navy, BRAND.navy));
  parts.push(
    `<g transform="translate(${x + (r1w - 96 * 2.0) / 2} ${r1y + (r1h - 72 * 2.0) / 2}) scale(2.0)">${markDarkInner}</g>`,
    label(x + r1w / 2, r1y + r1h + 22, "V mark (dark) — navy surface")
  );
  x += r1w + gap;
  parts.push(
    `<g transform="translate(${x} ${r1y}) scale(2.0)">${iconInner}</g>`,
    label(x + 96, r1y + r1h + 22, "App icon")
  );
  x += r1w + gap;
  parts.push(
    `<g transform="translate(${x} ${r1y}) scale(2.0)">${maskableInner}</g>`,
    label(x + 96, r1y + r1h + 22, "Maskable")
  );

  // Row 2: lockups (light surface + navy surface)
  const r2y = 340;
  const r2h = 110;
  const r2w = 600;
  const lkScale = 1.4;
  const lkW = 232 * lkScale;
  const lkH = 64 * lkScale;
  parts.push(card(40, r2y, r2w, r2h, "#FFFFFF"));
  parts.push(
    `<g transform="translate(${40 + (r2w - lkW) / 2} ${r2y + (r2h - lkH) / 2}) scale(${lkScale})">${lockupLightInner}</g>`,
    label(40 + r2w / 2, r2y + r2h + 22, "Lockup — light")
  );
  parts.push(card(660, r2y, r2w, r2h, BRAND.navy, BRAND.navy));
  parts.push(
    `<g transform="translate(${660 + (r2w - lkW) / 2} ${r2y + (r2h - lkH) / 2}) scale(${lkScale})">${lockupDarkInner}</g>`,
    label(660 + r2w / 2, r2y + r2h + 22, "Lockup — dark")
  );

  // Row 3: size ladder — equal-size demo samples with real captions.
  const r3y = 520;
  parts.push(
    `<text x="40" y="${r3y - 16}" font-family="sans-serif" font-size="15" font-weight="600" fill="#0B1220">Dydžių eilė (vienodo demonstracinio dydžio pavyzdžiai)</text>`
  );
  const sizes = [
    ["16×16", "favicon"],
    ["32×32", "favicon"],
    ["48×48", "favicon"],
    ["180×180", "Apple touch"],
    ["192×192", "PWA"],
    ["512×512", "PWA"],
    ["1024×1024", "iOS App Store"],
  ];
  sizes.forEach(([cap, name], i) => {
    const px = 40 + i * 165;
    parts.push(
      `<g transform="translate(${px} ${r3y}) scale(0.9)">${iconInner}</g>`,
      label(px + 43, r3y + 108, cap),
      `<text x="${px + 43}" y="${r3y + 122}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#8B93A7">${name}</text>`
    );
  });

  // Row 4: Android masks + iOS preview.
  const r4y = 690;
  const maskSize = 160;
  const masks = [
    [
      "Android — circle",
      `<circle cx="${40 + maskSize / 2}" cy="${r4y + maskSize / 2}" r="${maskSize / 2}" fill="none" stroke="#0B1220" stroke-width="3"/>`,
      40,
    ],
    [
      "Android — squircle",
      `<rect x="${220 + 4}" y="${r4y + 4}" width="${maskSize - 8}" height="${maskSize - 8}" rx="48" fill="none" stroke="#0B1220" stroke-width="3"/>`,
      220,
    ],
    [
      "iOS",
      `<rect x="${400 + 2}" y="${r4y + 2}" width="${maskSize - 4}" height="${maskSize - 4}" rx="36" fill="none" stroke="#0B1220" stroke-width="3"/>`,
      400,
    ],
  ];
  masks.forEach(([cap, outline, px]) => {
    parts.push(
      `<g transform="translate(${px} ${r4y}) scale(${maskSize / 96})">${iconInner}</g>`,
      outline,
      label(px + maskSize / 2, r4y + maskSize + 26, cap)
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 900">${parts.join("")}</svg>`;
}
