"use client";

import { Square } from "lucide-react";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import { cn } from "@/lib/cn";

export type BuddyPulseMode = "listening" | "reasoning" | "speaking";

interface BuddyVoicePulseProps {
  mode: BuddyPulseMode;
  variant?: "fullscreen" | "fab" | "compact";
  subtitle?: string;
  statusText?: string;
  hint?: string;
  levelSource?: () => number[];
  onCancel?: () => void;
  className?: string;
}

const MODE_COPY: Record<
  BuddyPulseMode,
  { status: string; glow: "teal" | "orange" }
> = {
  listening: { status: "Klausausi…", glow: "teal" },
  reasoning: { status: "AI analizuoja…", glow: "orange" },
  speaking: { status: "VAUTO atsako…", glow: "orange" },
};

export function BuddyVoicePulse({
  mode,
  variant = "fullscreen",
  subtitle,
  statusText,
  hint,
  levelSource,
  onCancel,
  className,
}: BuddyVoicePulseProps) {
  const copy = MODE_COPY[mode];
  const isOrange = copy.glow === "orange";
  const isFab = variant === "fab";
  const isCompact = variant === "compact";

  const pulseCore = (
    <div
      className={cn(
        "relative flex items-center justify-center",
        isFab ? "h-14 w-14" : isCompact ? "h-28 w-28" : "h-44 w-44 sm:h-52 sm:w-52"
      )}
    >
      <span
        className={cn(
          "buddy-ring-pulse pointer-events-none absolute inset-0 rounded-full",
          isOrange ? "buddy-glow-orange" : "buddy-glow-teal"
        )}
        aria-hidden
      />
      <span
        className={cn(
          "buddy-ring-pulse pointer-events-none absolute rounded-full",
          isOrange ? "buddy-glow-orange" : "buddy-glow-teal",
          isFab ? "inset-1" : "inset-3 sm:inset-4"
        )}
        style={{ animationDelay: "0.45s" }}
        aria-hidden
      />
      <span
        className={cn(
          "buddy-ring-pulse pointer-events-none absolute rounded-full opacity-80",
          isOrange ? "buddy-glow-orange" : "buddy-glow-teal",
          isFab ? "inset-2" : "inset-6 sm:inset-8"
        )}
        style={{ animationDelay: "0.9s" }}
        aria-hidden
      />

      <div
        className={cn(
          "buddy-orb relative z-10 flex items-center justify-center rounded-full shadow-2xl transition-all duration-500 ease-in-out",
          isOrange ? "buddy-orb-orange" : "buddy-orb-teal",
          isFab ? "h-14 w-14" : isCompact ? "h-20 w-20" : "h-28 w-28 sm:h-32 sm:w-32"
        )}
      >
        {!isFab && (
          <AudioWaveAnimation
            variant={isCompact ? "compact" : "large"}
            levelSource={levelSource}
            className={cn("opacity-95", isCompact ? "max-w-[120px]" : "max-w-[160px]")}
          />
        )}
        {isFab && (
          <span className="text-lg font-bold text-white" aria-hidden>
            V
          </span>
        )}
      </div>

      <svg
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
        viewBox="0 0 200 200"
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="none"
          stroke={isOrange ? "var(--vauto-orange)" : "var(--vauto-teal)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="buddy-wave-ring"
          opacity="0.55"
        />
        <circle
          cx="100"
          cy="100"
          r="58"
          fill="none"
          stroke={isOrange ? "var(--vauto-orange-light)" : "var(--flux-cyan)"}
          strokeWidth="1"
          strokeLinecap="round"
          className="buddy-wave-ring-reverse"
          opacity="0.4"
        />
      </svg>
    </div>
  );

  if (isFab) {
    return (
      <div
        className={cn("buddy-fab-enter pointer-events-auto", className)}
        role="status"
        aria-live="polite"
        aria-label="VAUTO asistentas aktyvus"
      >
        {pulseCore}
      </div>
    );
  }

  const shell = (
    <div
      className={cn(
        "flex flex-col items-center text-center transition-all duration-500 ease-in-out",
        className
      )}
      role="dialog"
      aria-live="assertive"
      aria-label="VAUTO balso asistentas"
    >
      {pulseCore}

      <p
        className={cn(
          "mt-6 font-display font-extrabold tracking-tight text-white transition-opacity duration-500 ease-in-out",
          isCompact ? "text-lg" : "text-xl sm:text-2xl"
        )}
      >
        {statusText ?? copy.status}
      </p>

      <p
        className={cn(
          "mt-4 max-w-md px-4 font-display font-bold leading-snug text-white transition-all duration-300 ease-in-out",
          subtitle ? "opacity-100" : "opacity-40",
          isCompact ? "min-h-[2.5rem] text-xl" : "min-h-[3rem] text-2xl sm:text-3xl"
        )}
      >
        {subtitle ? (
          <>
            <span className="sr-only">Girdimas tekstas: </span>
            &ldquo;{subtitle}&rdquo;
          </>
        ) : (
          <span className="text-white/30">…</span>
        )}
      </p>

      {hint && (
        <p className="mt-6 max-w-xs text-sm leading-relaxed text-slate-400">{hint}</p>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition duration-500 ease-in-out hover:bg-white/10 hover:text-white"
        >
          <Square className="h-4 w-4" />
          Atšaukti
        </button>
      )}
    </div>
  );

  if (variant === "fullscreen") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--flux-bg)]/94 backdrop-blur-xl">
        <div className="buddy-ambient-glow pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-6 w-full max-w-lg">{shell}</div>
      </div>
    );
  }

  return shell;
}
