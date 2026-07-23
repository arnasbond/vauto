"use client";

import { Camera, type LucideIcon } from "lucide-react";
import { useRef, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import { isMobilePhotoCaptureDevice } from "@/lib/native-media";

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
  /** When true (default on mobile), show Fotografuoti / Galerija sheet first. */
  offerCamera?: boolean;
}

/** Read gallery files as data URLs (multi-photo wardrobe basket). */
export async function readGalleryFilesAsDataUrls(
  files: File[],
  maxFiles = 8
): Promise<string[]> {
  const picked = files.slice(0, maxFiles);
  return Promise.all(
    picked.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Nepavyko nuskaityti nuotraukos"));
          };
          reader.onerror = () =>
            reject(reader.error ?? new Error("Nepavyko nuskaityti nuotraukos"));
          reader.readAsDataURL(file);
        })
    )
  );
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

/** Gallery + optional camera picker (Fotografuoti / Nuotraukų galerija). */
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
  offerCamera,
}: ListingGalleryFileInputProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const useSheet = offerCamera ?? isMobilePhotoCaptureDevice();

  const clickInput = (mode: "camera" | "gallery") => {
    onOpenPicker?.();
    const el = mode === "camera" ? cameraInputRef.current : galleryInputRef.current;
    el?.click();
  };

  const openPicker = () => {
    if (disabled) return;
    const run = () => {
      if (useSheet) {
        setSheetOpen(true);
        return;
      }
      clickInput("gallery");
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
      {/* Gallery — accept image/* without capture → OS gallery / photo library */}
      <input
        ref={galleryInputRef}
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
      {/* Camera — capture=environment → native Fotografuoti */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="listing-gallery-file-input"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) {
            onFilesSelected(Array.from(list).slice(0, 1));
          }
          e.target.value = "";
        }}
      />
      <PhotoSourceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(source) => {
          setSheetOpen(false);
          clickInput(source);
        }}
      />
    </>
  );
}
