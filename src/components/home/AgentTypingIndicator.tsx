"use client";

import { cn } from "@/lib/cn";

interface AgentTypingIndicatorProps {
  className?: string;
  label?: string;
  /** Bubble style like ChatGPT assistant message */
  variant?: "inline" | "bubble";
}

/** ChatGPT-style „rašo…" indikatorius kol agentas galvoja. */
export function AgentTypingIndicator({
  className,
  label = "Galvoju",
  variant = "bubble",
}: AgentTypingIndicatorProps) {
  const dots = (
    <span className="inline-flex items-center gap-1" aria-hidden>
      <span className="agent-typing-dot h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      <span className="agent-typing-dot agent-typing-dot-2 h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      <span className="agent-typing-dot agent-typing-dot-3 h-1.5 w-1.5 rounded-full bg-current opacity-60" />
    </span>
  );

  if (variant === "inline") {
    return (
      <p
        className={cn(
          "flex items-center gap-2 px-1 text-[12px] text-[var(--vauto-text-muted)]",
          className
        )}
        role="status"
        aria-live="polite"
        aria-label={`${label}…`}
      >
        <span className="font-medium">{label}</span>
        {dots}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-3.5 py-2.5 text-[12px] text-[var(--vauto-text-muted)] shadow-sm",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`VAUTO asistentas ${label.toLowerCase()}…`}
    >
      <span className="font-medium text-[var(--vauto-text)]">{label}</span>
      {dots}
    </div>
  );
}
