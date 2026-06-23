/** Vauto Flux 2026 wordmark — Outfit display + gradient accent */
export function VautoLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`font-display text-2xl font-extrabold tracking-tight ${className || "text-white"}`}>
      vauto<span className="text-[#f97316]">.</span>
    </div>
  );
}
