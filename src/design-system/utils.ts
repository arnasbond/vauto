import { cn } from "@/lib/cn";

export { cn };

/** Shared control sizes for DS 2.0. */
export type DsSize = "sm" | "md" | "lg";

export const DS_CONTROL_SIZE: Record<
  DsSize,
  { height: string; paddingX: string; text: string; gap: string; icon: string }
> = {
  sm: {
    height: "h-8",
    paddingX: "px-3",
    text: "text-[length:var(--ds-text-caption-size)]",
    gap: "gap-1.5",
    icon: "h-3.5 w-3.5",
  },
  md: {
    height: "h-10",
    paddingX: "px-4",
    text: "text-[length:var(--ds-text-button-size)]",
    gap: "gap-2",
    icon: "h-4 w-4",
  },
  lg: {
    height: "h-12",
    paddingX: "px-5",
    text: "text-[length:var(--ds-text-body-sm-size)]",
    gap: "gap-2",
    icon: "h-5 w-5",
  },
};
