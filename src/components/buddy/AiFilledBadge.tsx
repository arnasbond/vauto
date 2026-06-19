"use client";

interface AiFilledBadgeProps {
  visible: boolean;
}

/** Flashes green reassurance label next to AI-populated fields; fades via parent timer. */
export function AiFilledBadge({ visible }: AiFilledBadgeProps) {
  if (!visible) return null;

  return (
    <span
      className="ai-filled-badge ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400"
      aria-label="AI užpildė šį lauką"
    >
      ⚡ AI užpildė
    </span>
  );
}
