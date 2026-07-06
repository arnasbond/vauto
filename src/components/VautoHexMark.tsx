import { cn } from "@/lib/cn";

const SIZES = { sm: 28, md: 36, lg: 48, xl: 64 } as const;

/** Glowing hexagon + circuit „V“ — VAUTO 2026 brand mark */
export function VautoHexMark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("vauto-hex-mark shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="vautoHexStroke" x1="8" y1="4" x2="40" y2="44">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="vautoHexFill" x1="14" y1="12" x2="34" y2="38">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <filter id="vautoHexGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polygon
        points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5"
        stroke="url(#vautoHexStroke)"
        strokeWidth="1.75"
        fill="rgba(0, 212, 255, 0.08)"
        filter="url(#vautoHexGlow)"
      />
      <path
        d="M15 14 L24 34 L33 14"
        stroke="url(#vautoHexFill)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="15" cy="14" r="1.25" fill="#67e8f9" />
      <circle cx="24" cy="34" r="1.25" fill="#00d4ff" />
      <circle cx="33" cy="14" r="1.25" fill="#67e8f9" />
      <path
        d="M15 14 H19 M29 14 H33 M22 24 H26"
        stroke="#7dd3fc"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
