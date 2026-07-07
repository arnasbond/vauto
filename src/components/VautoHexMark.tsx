import { cn } from "@/lib/cn";

const SIZES = { sm: 20, md: 28, lg: 36, xl: 48 } as const;

/** Transparent hexagon + „V“ — app icon / subtle accent only (no background fill). */
export function VautoHexMark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const uid = `hex-${size}`;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-stroke`} x1="8" y1="4" x2="40" y2="44">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <polygon
        points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5"
        stroke={`url(#${uid}-stroke)`}
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M15 14 L24 34 L33 14"
        stroke={`url(#${uid}-stroke)`}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
