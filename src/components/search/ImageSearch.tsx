"use client";

import { Camera, ImageIcon, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import {
  isMobilePhotoCaptureDevice,
  type CapturedPhoto,
} from "@/lib/native-media";

function readFileAsCapturedPhoto(file: File): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        resolve(null);
        return;
      }
      resolve({ dataUrl: reader.result, fileName: file.name });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function CaptureTile({
  label,
  icon: Icon,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const primary =
    variant === "primary"
      ? "border-2 border-dashed border-[#00f2fe]/60 bg-[#1e293b] text-[#00f2fe] hover:bg-[#334155]"
      : "border border-slate-600 bg-[#1e293b] text-slate-200 hover:bg-[#334155]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl px-2 transition disabled:opacity-50 ${primary}`}
    >
      <Icon className="h-7 w-7" />
      <span className="text-center text-xs font-semibold leading-tight">{label}</span>
    </button>
  );
}

export interface ImageSearchCaptureProps {
  disabled?: boolean;
  onCapture: (photo: CapturedPhoto) => void;
  replaceMode?: boolean;
}

/**
 * Photo search capture — sync file input inside tap gesture (mobile camera + desktop gallery fallback).
 */
export function ImageSearchCapture({
  disabled,
  onCapture,
  replaceMode = false,
}: ImageSearchCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const mobileCapture = isMobilePhotoCaptureDevice();

  const applyFile = async (file: File | undefined) => {
    if (!file) return;
    const photo = await readFileAsCapturedPhoto(file);
    if (photo) onCapture(photo);
  };

  const openCamera = () => {
    if (disabled) return;
    if (mobileCapture) {
      cameraInputRef.current?.click();
      return;
    }
    galleryInputRef.current?.click();
  };

  const openGallery = () => {
    if (disabled) return;
    galleryInputRef.current?.click();
  };

  const cameraLabel = replaceMode ? "Fotografuoti iš naujo" : "Fotografuoti";
  const galleryLabel = replaceMode ? "Kita iš galerijos" : "Galerija";

  return (
    <>
      <CaptureTile
        label={cameraLabel}
        icon={Camera}
        onClick={openCamera}
        disabled={disabled}
        variant="primary"
      />
      <CaptureTile
        label={galleryLabel}
        icon={ImageIcon}
        onClick={openGallery}
        disabled={disabled}
        variant="secondary"
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="listing-gallery-file-input"
        onChange={(e) => {
          void applyFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        className="listing-gallery-file-input"
        onChange={(e) => {
          void applyFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}