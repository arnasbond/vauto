import { VautoHexMark } from "@/components/VautoHexMark";
import { cn } from "@/lib/cn";

type VautoLogoProps = {
  className?: string;
  /** Legacy wordmark dot color */
  color?: string;
  dotColor?: string;
  /** `brand` = hex mark + VAUTO gradient wordmark (mobile header) */
  variant?: "wordmark" | "brand";
  markSize?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
};

/** VAUTO wordmark — Outfit display + neon brand mark */
export function VautoLogo({
  className = "",
  color,
  dotColor = "#00d4ff",
  variant = "wordmark",
  markSize = "md",
  showTagline = false,
}: VautoLogoProps) {
  if (variant === "brand") {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        <VautoHexMark size={markSize} />
        <div className="flex min-w-0 flex-col leading-none">
          <span className="vauto-brand-wordmark font-display text-[1.35rem] font-extrabold tracking-tight sm:text-2xl">
            VAUTO
          </span>
          {showTagline && (
            <span className="vauto-brand-tagline mt-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]">
              AI Marketplace
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "font-display text-2xl font-extrabold tracking-tight",
        className || (!color ? "text-white" : "")
      )}
      style={color ? { color } : undefined}
    >
      VAUTO<span style={{ color: dotColor }}>.</span>
    </div>
  );
}
