"use client";

/**
 * F7 Branding Closure — the canonical VAUTO mark.
 *
 * Two equal geometric halves forming a modern "V" on a dark navy rounded
 * square: white + emerald. Geometry mirrors the single source of truth in
 * scripts/brand/brand-geometry.mjs (viewBox 0 0 96 96 icon canvas).
 * Decorative by design — parent MUST provide the accessible name.
 */

const MARK_HALF_A = "12,0 36,0 48,72 24,72";
const MARK_HALF_B = "60,0 84,0 72,72 48,72";

export function VautoMark({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Mark only (no wordmark) for tight spaces. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        data-brand-mark
        aria-hidden
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center ${className}`}
      >
        <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden focusable="false">
          <rect x="4" y="4" width="88" height="88" rx="24" fill="#0B1220" />
          <g transform="translate(18.3 27.6) scale(0.62)">
            <polygon points={MARK_HALF_A} fill="#FFFFFF" />
            <polygon points={MARK_HALF_B} fill="var(--vauto-primary,#10b981)" />
          </g>
        </svg>
      </span>
    );
  }

  return (
    <span
      data-brand-logo
      role="img"
      aria-label="VAUTO"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span data-brand-mark aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
        <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden focusable="false">
          <rect x="4" y="4" width="88" height="88" rx="24" fill="#0B1220" />
          <g transform="translate(18.3 27.6) scale(0.62)">
            <polygon points={MARK_HALF_A} fill="#FFFFFF" />
            <polygon points={MARK_HALF_B} fill="var(--vauto-primary,#10b981)" />
          </g>
        </svg>
      </span>
      <span
        aria-hidden
        className="font-[family-name:var(--font-outfit)] text-[1.35rem] font-extrabold tracking-tight text-[var(--vauto-text-main)]"
      >
        VAUTO
      </span>
    </span>
  );
}
