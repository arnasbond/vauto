type BrandLogoProps = {
  className?: string;
};

/** VAUTO wordmark — brand ink + primary dot. */
export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex items-baseline gap-0.5 font-[family-name:var(--font-outfit)] text-[1.35rem] font-extrabold tracking-tight text-[var(--vauto-ink)] ${className}`}
    >
      VAUTO
      <span className="text-[var(--vauto-primary)]" aria-hidden>
        .
      </span>
    </span>
  );
}
