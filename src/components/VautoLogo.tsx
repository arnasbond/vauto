/** VAUTO Flux 2026 wordmark — Outfit display + gradient accent */
export function VautoLogo({
  className = "",
  color,
  dotColor = "#f97316",
}: {
  className?: string;
  color?: string;
  dotColor?: string;
}) {
  return (
    <div
      className={`font-display text-2xl font-extrabold tracking-tight ${className || (!color ? "text-white" : "")}`}
      style={color ? { color } : undefined}
    >
      VAUTO<span style={{ color: dotColor }}>.</span>
    </div>
  );
}
