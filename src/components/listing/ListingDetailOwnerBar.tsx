"use client";

import {
  BarChart3,
  CheckCircle2,
  EyeOff,
  Pencil,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card } from "@/design-system";
import { OwnerListingPromote } from "@/components/listing/OwnerListingPromote";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

export type ListingDetailOwnerBarProps = {
  listing: Listing;
  onEdit: () => void;
  onMarkSold: () => void;
  onHide: () => void;
  onAiOptimize?: () => void;
  className?: string;
};

/**
 * Savininko režimo juosta — atskirta nuo pirkėjo UI.
 * Tik perduoda esamus handlerius (jokia nauja verslo logika).
 */
export function ListingDetailOwnerBar({
  listing,
  onEdit,
  onMarkSold,
  onHide,
  onAiOptimize,
  className,
}: ListingDetailOwnerBarProps) {
  if (listing.status === "sold") return null;

  return (
    <Card
      variant="warning"
      data-owner-mode-bar
      className={cn(
        "mb-4 border-[var(--ds-warning)]/35 bg-[var(--ds-warning-soft)]",
        className
      )}
      role="region"
      aria-label="Savininko režimas"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Savininko režimas</Badge>
            <p className="text-sm font-bold text-[var(--ds-text-primary)]">
              Jūsų skelbimas
            </p>
          </div>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Šie veiksmai matomi tik jums — pirkėjai jų nemato.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Pencil className="h-3.5 w-3.5" />}
          onClick={onEdit}
        >
          Redaguoti
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<BarChart3 className="h-3.5 w-3.5" />}
          onClick={() => {
            document
              .getElementById("owner-promote-section")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Statistika
        </Button>
        <Button
          variant="ai"
          size="sm"
          leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          onClick={onAiOptimize}
        >
          AI Optimizuoti
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
          onClick={onMarkSold}
        >
          Pažymėti parduotu
        </Button>
        <Button
          variant="danger"
          size="sm"
          leftIcon={<EyeOff className="h-3.5 w-3.5" />}
          onClick={onHide}
        >
          Paslėpti
        </Button>
      </div>

      <div id="owner-promote-section" className="mt-4 space-y-3">
        <OwnerListingPromote listing={listing} />
        <div className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--ds-text-secondary)]">
            Dalintis socialiniuose tinkluose
          </p>
          <ShareListingPanel listing={listing} compact />
        </div>
      </div>
    </Card>
  );
}
