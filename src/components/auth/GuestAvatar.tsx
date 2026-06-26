"use client";

import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

type GuestAvatarSize = "sm" | "md" | "lg";

const SIZE: Record<GuestAvatarSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-16 w-16",
};

interface GuestAvatarProps {
  size?: GuestAvatarSize;
  className?: string;
  showLabel?: boolean;
}

/** Neutral guest indicator — no personal photo for anonymous users */
export function GuestAvatar({ size = "sm", className, showLabel }: GuestAvatarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/80 text-[var(--vauto-text-muted)]",
          SIZE[size]
        )}
        aria-hidden
      >
        <UserRound className={size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4"} />
      </span>
      {showLabel && (
        <span className="text-xs font-medium text-[var(--vauto-text-muted)]">
          Anoniminis naršymas
        </span>
      )}
    </div>
  );
}
