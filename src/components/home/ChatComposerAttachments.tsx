"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ChatComposerAttachmentsProps {
  urls: string[];
  onRemove: (index: number) => void;
  className?: string;
}

export function ChatComposerAttachments({
  urls,
  onRemove,
  className,
}: ChatComposerAttachmentsProps) {
  if (!urls.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 px-0.5 pb-1",
        className
      )}
      aria-label="Pasirinktos nuotraukos"
    >
      {urls.map((url, index) => (
        <div
          key={`${url.slice(0, 48)}-${index}`}
          className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--vauto-primary)]/20 bg-slate-100 shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Nuotrauka ${index + 1}`}
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
      ))}
    </div>
  );
}
