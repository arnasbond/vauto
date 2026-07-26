"use client";

import { FileText, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatDocumentUploadedBadge,
  type ChatComposerAttachment,
} from "@/lib/chat-attachment-types";

export interface ChatComposerAttachmentsProps {
  items: ChatComposerAttachment[];
  onRemove: (index: number) => void;
  className?: string;
}

export function ChatComposerAttachments({
  items,
  onRemove,
  className,
}: ChatComposerAttachmentsProps) {
  if (!items.length) return null;

  return (
    <div
      className={cn("flex flex-wrap gap-2 px-0.5 pb-1", className)}
      aria-label="Pasirinkti priedai"
    >
      {items.map((item, index) =>
        item.kind === "image" ? (
          <div
            key={item.id}
            className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--vauto-primary)]/20 bg-slate-100 shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.fileName || `Nuotrauka ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-90 transition hover:bg-black/80"
              aria-label="Pašalinti nuotrauką"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ) : (
          <div
            key={item.id}
            className="group relative flex max-w-[14rem] items-center gap-2 rounded-xl border border-[var(--vauto-primary)]/25 bg-[var(--vauto-primary)]/5 px-2.5 py-2 shadow-sm"
          >
            <FileText
              className="h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
              aria-hidden
            />
            <span className="min-w-0 truncate text-[11px] font-medium leading-snug text-[var(--vauto-ink)]">
              {formatDocumentUploadedBadge(item.fileName)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
              aria-label="Pašalinti dokumentą"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )
      )}
    </div>
  );
}
