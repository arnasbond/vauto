/**
 * F7 Branding Closure — canonical VAUTO mark geometry.
 *
 * Single source of truth for the final brand:
 *   - mark: TWO equal geometric halves forming a modern "V";
 *   - primary: dark navy  #0B1220;
 *   - accent (light):     #10B981  ·  accent (dark): #34D399;
 *   - wordmark: geometric, stroke-based "VAUTO" (path-only, no fonts);
 *   - no gradients, no glows, no vehicle symbolism, no purple,
 *     no legacy orange #FF5722, no legacy blue #1B4DFF.
 */

export const BRAND = {
  navy: "#0B1220",
  navySurface: "#121A2B",
  white: "#FFFFFF",
  emeraldLight: "#10B981",
  emeraldDark: "#34D399",
  forbidden: ["#1B4DFF", "#FF5722", "#FF7A1A", "#00BFA5"],
};

/** The V mark. viewBox 0 0 96 72. Left half = polygon A, right half = B. */
export const MARK_VIEWBOX = "0 0 96 72";
export const MARK_HALF_A = "12,0 36,0 48,72 24,72";
export const MARK_HALF_B = "60,0 84,0 72,72 48,72";

/** App icon canvas: rounded square on navy. */
export const ICON_VIEWBOX = "0 0 96 96";
export const ICON_SQUARE = { x: 4, y: 4, w: 88, h: 88, rx: 24 };

/** V placement inside the app icon (content vs maskable safe zones). */
export const ICON_MARK_FIT = { scale: 0.62, x: 18.3, y: 27.6 };
export const ICON_MASKABLE_FIT = { scale: 0.5, x: 23, y: 30.5 };

export function markSvg(colors) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    `<polygon points="${MARK_HALF_A}" fill="${colors.a}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${colors.b}"/>` +
    `</svg>`
  );
}

export function iconSvg(opts) {
  const fit = opts.maskable ? ICON_MASKABLE_FIT : ICON_MARK_FIT;
  // bleed=true → full-bleed square (maskable / iOS App Store icon).
  const s = opts.bleed
    ? { x: 0, y: 0, w: 96, h: 96, rx: 0 }
    : ICON_SQUARE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}">` +
    `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${opts.bg}"/>` +
    `<g transform="translate(${fit.x} ${fit.y}) scale(${fit.scale})">` +
    `<polygon points="${MARK_HALF_A}" fill="${opts.a}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${opts.b}"/>` +
    `</g></svg>`
  );
}

/** Mono mark (notification icon): whole V in one color, transparent bg. */
export function markMonoSvg(color) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    `<polygon points="${MARK_HALF_A}" fill="${color}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${color}"/>` +
    `</svg>`
  );
}

/* ---------------------------------------------------------------------- */
/* Geometric stroke-based wordmark "VAUTO" (no fonts, fully deterministic) */
/* ---------------------------------------------------------------------- */

const STROKE_W = 10;

function strokePath(d) {
  return { d };
}

/**
 * Letters on a 72-tall cap-height grid. All strokes are rounded; each letter
 * occupies an advance slot so the lockup stays perfectly deterministic.
 */
function buildLetters() {
  const letters = [];
  let x = 4;

  // V
  letters.push(strokePath(`M${x},10 L${x + 18},64 M${x + 36},10 L${x + 18},64`));
  x += 48;
  // A
  letters.push(
    strokePath(`M${x},64 L${x + 16},10 L${x + 32},64 M${x + 7},42 L${x + 25},42`)
  );
  x += 40;
  // U
  letters.push(
    strokePath(`M${x},10 V44 Q${x},62 ${x + 16},62 Q${x + 32},62 ${x + 32},44 V10`)
  );
  x += 40;
  // T
  letters.push(strokePath(`M${x},10 H${x + 28} M${x + 14},10 V64`));
  x += 36;
  // O
  letters.push(
    strokePath(
      `M${x},34 V20 Q${x},10 ${x + 10},10 H${x + 22} Q${x + 32},10 ${x + 32},20 V44 Q${x + 32},54 ${x + 22},54 H${x + 10} Q${x},54 ${x},44 Z`
    )
  );
  x += 40;

  return { paths: letters, width: x + 8 };
}

export function wordmarkSvg(color) {
  const { paths, width } = buildLetters();
  const vb = `0 0 ${width} 72`;
  const body = paths.map((p) => `<path d="${p.d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
    `<g fill="none" stroke="${color}" stroke-width="${STROKE_W}" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    `</svg>`
  );
}

/** Horizontal lockup: icon-mark square + geometric VAUTO wordmark. */
export function lockupSvg(opts) {
  const { width } = buildLetters();
  const iconSize = 64;
  const gap = 20;
  const targetWordW = 150;
  const wordScale = targetWordW / width;
  const wordH = 72 * wordScale;
  const totalW = iconSize + gap + targetWordW;
  const totalH = Math.max(iconSize, wordH);
  const iconY = (totalH - iconSize) / 2;
  const wordX = iconSize + gap;
  const wordY = (totalH - wordH) / 2;
  const body = buildLetters()
    .paths.map((p) => `<path d="${p.d}"/>`)
    .join("");
  const s = ICON_SQUARE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}">` +
    `<g transform="translate(0 ${iconY})">` +
    `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${opts.bg}"/>` +
    `<g transform="translate(${ICON_MARK_FIT.x} ${ICON_MARK_FIT.y}) scale(${ICON_MARK_FIT.scale})">` +
    `<polygon points="${MARK_HALF_A}" fill="${opts.iconA}"/>` +
    `<polygon points="${MARK_HALF_B}" fill="${opts.iconB}"/>` +
    `</g></g>` +
    `<g transform="translate(${wordX} ${wordY}) scale(${wordScale})" fill="none" stroke="${opts.text}" stroke-width="${STROKE_W}" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    `</svg>`
  );
}
