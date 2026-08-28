import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";

type ListingImagePlaceholderProps = {
  fill?: boolean;
  className?: string;
};

/**
 * Intentional "no photo" state for listing media — replaces the previous
 * reliance on an external Cloudinary placeholder asset (which rendered as a
 * flat empty gray block whenever it failed to load, e.g. in restricted
 * network environments, and read as a broken/unfinished card even when it
 * loaded). This is a local, theme-aware, dependency-free fallback: a subtle
 * two-tone surface with a centered icon, using only design-system tokens so
 * it automatically matches LIGHT and DARK without any extra data or network
 * request. It never claims to be a real photo and never fabricates one.
 */
export function ListingImagePlaceholder({
  fill,
  className,
}: ListingImagePlaceholderProps) {
  return (
    <div
      role="img"
      aria-label="Nuotraukos nėra"
      className={cn(
        "flex items-center justify-center",
        fill ? "absolute inset-0" : "h-full w-full",
        className
      )}
      style={{
        background:
          "linear-gradient(155deg, var(--ds-surface-muted) 0%, var(--ds-surface-card) 100%)",
      }}
    >
      <div className="flex flex-col items-center gap-1.5 opacity-70">
        <ImageOff
          className="h-6 w-6 text-[var(--ds-text-muted)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="text-[10px] font-medium text-[var(--ds-text-muted)]">
          Nuotraukos nėra
        </span>
      </div>
    </div>
  );
}
