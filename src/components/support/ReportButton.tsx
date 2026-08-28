"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ReportModal } from "@/components/support/ReportModal";

interface ReportButtonProps {
  listingId?: string;
  listingTitle?: string;
  reportedUserId?: string;
  chatId?: string;
  chatPreview?: string;
  variant?: "inline" | "icon";
}

export function ReportButton({
  listingId,
  listingTitle,
  reportedUserId,
  chatId,
  chatPreview,
  variant = "inline",
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-surface-muted)]"
          aria-label="Pranešti apie pažeidimą"
        >
          <Flag className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ds-warning)]/30 bg-[var(--ds-warning-soft)] py-3 text-sm font-medium text-[var(--ds-warning)]"
        >
          <Flag className="h-4 w-4" />
          Pranešti apie pažeidimą
        </button>
      )}

      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        listingId={listingId}
        listingTitle={listingTitle}
        reportedUserId={reportedUserId}
        chatId={chatId}
        chatPreview={chatPreview}
      />
    </>
  );
}
