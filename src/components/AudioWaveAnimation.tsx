"use client";

import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 9;
const FALLBACK_DELAYS = [0, 0.12, 0.24, 0.08, 0.2, 0.16, 0.28, 0.04, 0.18];

interface AudioWaveAnimationProps {
  variant?: "compact" | "large";
  /** Poll levels from shared voice session — real-time reactive bars */
  levelSource?: () => number[];
  className?: string;
}

export function AudioWaveAnimation({
  variant = "large",
  levelSource,
  className = "",
}: AudioWaveAnimationProps) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.35)
  );
  const rafRef = useRef<number>(0);
  const reactive = Boolean(levelSource);

  useEffect(() => {
    if (!levelSource) return;

    const tick = () => {
      setLevels(levelSource());
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(rafRef.current);
  }, [levelSource]);

  const isLarge = variant === "large";
  const barWidth = isLarge ? "w-1.5" : "w-1";
  const barHeight = isLarge ? "h-16" : "h-8";
  const gap = isLarge ? "gap-1.5" : "gap-1";

  return (
    <div
      className={`flex items-end justify-center ${gap} ${className}`}
      role="img"
      aria-label="Garso bangos"
    >
      {levels.map((level, i) => (
        <span
          key={i}
          className={`${reactive ? "" : "audio-wave-bar"} ${barWidth} ${barHeight} rounded-full bg-gradient-to-t from-[var(--vauto-orange)] to-[var(--vauto-red)]`}
          style={{
            animationDelay: reactive ? undefined : `${FALLBACK_DELAYS[i]}s`,
            transform: reactive ? `scaleY(${level})` : undefined,
            transformOrigin: "bottom center",
            transition: reactive ? "transform 70ms ease-out" : undefined,
          }}
        />
      ))}
    </div>
  );
}
