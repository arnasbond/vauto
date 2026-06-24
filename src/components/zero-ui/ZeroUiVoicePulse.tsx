"use client";

import { Mic, Sparkles } from "lucide-react";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import { cn } from "@/lib/cn";

export type ZeroUiVoicePhase = "listening" | "silence_hold" | "thinking";

const PHASE_COPY: Record<ZeroUiVoicePhase, string> = {
  listening: "Klausausi…",
  silence_hold: "Apdoroju kalbą…",
  thinking: "Gemini analizuoja…",
};

interface ZeroUiVoicePulseProps {
  phase: ZeroUiVoicePhase;
  subtitle?: string;
  variant?: "hero" | "inline" | "chip";
  className?: string;
}

export function ZeroUiVoicePulse({
  phase,
  subtitle,
  variant = "hero",
  className,
}: ZeroUiVoicePulseProps) {
  const isThinking = phase === "thinking";
  const isSilence = phase === "silence_hold";
  const glowClass = isThinking ? "zero-ui-glow-gemini" : "zero-ui-glow-voice";

  if (variant === "chip") {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
          isThinking
            ? "border-[#1167b1]/40 bg-[#eef6ff] text-[#1167b1]"
            : "border-[#f97316]/35 bg-[#fff7ed] text-[#c2410c]",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <span className={cn("zero-ui-dot-pulse h-2 w-2 shrink-0 rounded-full", glowClass)} />
        <span className="truncate font-medium">
          {subtitle ? `"${subtitle}"` : PHASE_COPY[phase]}
        </span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={cn("flex items-center gap-3", className)}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            isThinking ? "bg-[#eef6ff] text-[#1167b1]" : "bg-[#fff7ed] text-[#f97316]"
          )}
        >
          <span className={cn("zero-ui-ring-pulse absolute inset-0 rounded-full", glowClass)} />
          {isThinking ? (
            <Sparkles className="relative h-4 w-4 zero-ui-icon-pulse" />
          ) : (
            <Mic className="relative h-4 w-4 zero-ui-icon-pulse" fill="currentColor" strokeWidth={0} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111827]">{PHASE_COPY[phase]}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm italic text-[#6b7280]">&ldquo;{subtitle}&rdquo;</p>
          )}
        </div>
        <AudioWaveAnimation variant="compact" className="max-w-[72px] opacity-80" />
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col items-center text-center", className)}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
        <span className={cn("zero-ui-ring-pulse absolute inset-0 rounded-full", glowClass)} />
        <span
          className={cn(
            "zero-ui-ring-pulse absolute inset-2 rounded-full opacity-70",
            glowClass
          )}
          style={{ animationDelay: "0.45s" }}
        />
        <span
          className={cn(
            "zero-ui-ring-pulse absolute inset-4 rounded-full opacity-50",
            glowClass
          )}
          style={{ animationDelay: "0.9s" }}
        />
        <div
          className={cn(
            "relative z-10 flex h-16 w-16 items-center justify-center rounded-full shadow-lg sm:h-[4.5rem] sm:w-[4.5rem]",
            isThinking ? "bg-[#1167b1] text-white" : "bg-[#f97316] text-white"
          )}
        >
          {isThinking ? (
            <Sparkles className="h-7 w-7 zero-ui-icon-pulse" />
          ) : (
            <Mic className="h-7 w-7 zero-ui-icon-pulse" fill="currentColor" strokeWidth={0} />
          )}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={isThinking ? "#1167b1" : "#f97316"}
            strokeWidth="1.5"
            className="buddy-wave-ring"
            opacity="0.45"
          />
        </svg>
      </div>

      <p className="mt-4 text-sm font-semibold text-[#111827]">
        {isSilence ? "Trumpa pauzė — ruošiu Gemini užklausą…" : PHASE_COPY[phase]}
      </p>

      <p
        className={cn(
          "mt-2 min-h-[2.75rem] max-w-sm px-2 text-sm leading-relaxed transition-opacity duration-300",
          subtitle ? "text-[#374151] opacity-100" : "text-[#9ca3af] opacity-60"
        )}
      >
        {subtitle ? (
          <>
            <span className="sr-only">Girdimas tekstas: </span>
            &ldquo;{subtitle}&rdquo;
          </>
        ) : (
          "Pradėkite kalbėti…"
        )}
      </p>

      <div className="mt-4 w-full max-w-[200px]">
        <AudioWaveAnimation variant="compact" className="mx-auto opacity-90" />
      </div>
    </div>
  );
}
