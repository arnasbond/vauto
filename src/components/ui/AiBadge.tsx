import type { ReactNode } from "react";

type AiBadgeProps = {
  children?: ReactNode;
  className?: string;
};

/** Orange AI marker — never use for prices or body text. */
export function AiBadge({ children = "AI paruošta", className = "" }: AiBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}
      style={{ backgroundColor: "var(--vauto-ai)" }}
    >
      {children}
    </span>
  );
}
