"use client";

import { Camera, type LucideIcon } from "lucide-react";
import { useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ListingGalleryFileInputProps {
  onFilesSelected: (files: File[]) => void;
  onOpenPicker?: () => void;
  requestConsent?: (onGranted: () => void) => void;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  icon?: LucideIcon;
  label: ReactNode;
  hint?: ReactNode;
  /** Increment to open the native picker from outside (e.g. agent quick-reply chip). */
  openPickerSignal?: number;
}

/** Read first selected image as a data URL (shared by listing wizards). */
export function applyFirstGalleryFile(
  files: File[],
  onDataUrl: (dataUrl: string) => void
): void {
  const file = files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") onDataUrl(reader.result);
  };
  reader.readAsDataURL(file);
}

/** Gallery-first file picker — never sets HTML capture (mobile opens media library). */
export function ListingGalleryFileInput({
  onFilesSelected,
  onOpenPicker,
  requestConsent,
  multiple = true,
  maxFiles = 50,
  disabled,
  className,
  icon: Icon = Camera,
  label,
  hint,
  openPickerSignal,
}: ListingGalleryFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    const run = () => {
      onOpenPicker?.();
      inputRef.current?.click();
    };
    if (requestConsent) requestConsent(run);
    else run();
  };

  useEffect(() => {
    if (!openPickerSignal) return;
    openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal-only external trigger
  }, [openPickerSignal]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className={cn(className)}
      >
        <Icon className="h-8 w-8" />
        <span className="text-sm font-semibold">{label}</span>
        {hint ? <span className="text-xs opacity-80">{hint}</span> : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        tabIndex={-1}
        aria-hidden
        className="listing-gallery-file-input"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) {
            onFilesSelected(Array.from(list).slice(0, maxFiles));
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
