import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

/**
 * VAUTO content wrapper — single source of truth for max-width, gutters and
 * section rhythm (Stage 17C / 17L). Organic composition per breakpoint, never
 * stretch. Base tokens live in `--ds-content-max`, `--ds-gutter-*`,
 * `--ds-section-gap`. No horizontal overflow at any breakpoint.
 */
export type ContentContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Vertical section rhythm. */
  spacing?: "none" | "sm" | "md" | "lg";
};

export function ContentContainer({
  children,
  spacing = "md",
  className,
  ...rest
}: ContentContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[var(--ds-content-max)] px-[var(--ds-gutter-mobile)] md:px-[var(--ds-gutter-tablet)] xl:px-[var(--ds-gutter-desktop)]",
        spacing === "none" && "py-0",
        spacing === "sm" && "py-4 md:py-5",
        spacing === "md" && "py-[var(--ds-section-gap)]",
        spacing === "lg" && "py-[var(--ds-section-gap-lg)]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
