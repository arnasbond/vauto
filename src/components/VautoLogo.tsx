/** Vauto Flux 2026 wordmark — Outfit display + gradient accent */
export function VautoLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`font-display text-2xl font-extrabold tracking-tight text-white ${className}`}>
      vauto<span className="vauto-flux-gradient-text">.</span>
    </div>
  );
}
