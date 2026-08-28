type BrandLogoProps = {
  className?: string;
};

/**
 * VAUTO wordmark — brand ink + primary dot.
 *
 * Uses --vauto-text-main (not --vauto-ink) so the wordmark stays legible in
 * DARK theme: --vauto-ink is a LIGHT-only legacy token with no DARK override,
 * which previously rendered the wordmark at near-zero contrast against the
 * DARK header (red-team RT-P0-1, MASTER Wave 2 Final Remediation).
 */
export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex items-baseline gap-0.5 font-[family-name:var(--font-outfit)] text-[1.35rem] font-extrabold tracking-tight text-[var(--vauto-text-main)] ${className}`}
    >
      VAUTO
      <span className="text-[var(--vauto-primary)]" aria-hidden>
        .
      </span>
    </span>
  );
}
