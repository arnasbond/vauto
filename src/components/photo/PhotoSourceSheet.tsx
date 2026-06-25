"use client";

import { Camera, ChevronRight, ImageIcon, X } from "lucide-react";

interface PhotoSourceSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (source: "camera" | "gallery") => void;
}

export function PhotoSourceSheet({
  open,
  onClose,
  onSelect,
}: PhotoSourceSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Pridėti nuotraukas"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white px-4 pb-6 pt-3 shadow-xl animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#111827]">
            Pridėti nuotraukas
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelect("camera")}
          className="mb-2 flex w-full items-center gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3.5 text-left transition hover:bg-[#f9fafb]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef6ff] text-[#1167b1]">
            <Camera className="h-5 w-5" />
          </span>
          <span className="flex-1 text-sm font-medium text-[#111827]">
            Fotografuoti
          </span>
          <ChevronRight className="h-5 w-5 text-[#9ca3af]" />
        </button>

        <button
          type="button"
          onClick={() => onSelect("gallery")}
          className="flex w-full items-center gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3.5 text-left transition hover:bg-[#f9fafb]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef6ff] text-[#1167b1]">
            <ImageIcon className="h-5 w-5" />
          </span>
          <span className="flex-1 text-sm font-medium text-[#111827]">
            Pasirinkti iš galerijos
          </span>
          <ChevronRight className="h-5 w-5 text-[#9ca3af]" />
        </button>
      </div>
    </div>
  );
}
