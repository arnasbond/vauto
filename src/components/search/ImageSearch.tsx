"use client";

import { Camera, ImageIcon } from "lucide-react";
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

const TILE_BASE =
  "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl px-2 transition disabled:opacity-50";

export interface ImageSearchCaptureProps {
  disabled?: boolean;
  onCapture: (photo: CapturedPhoto) => void;
  replaceMode?: boolean;
}

/**
 * Photo search capture — label-wrapped file inputs keep the mobile user-gesture chain
 * so capture="environment" opens the rear camera instead of the gallery.
 */
export function ImageSearchCapture({
  disabled,
  onCapture,
  replaceMode = false,
}: ImageSearchCaptureProps) {
  const mobileCapture = isMobilePhotoCaptureDevice();

  const applyFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    const photo = await readFileAsCapturedPhoto(file);
    if (photo) onCapture(photo);
  };

  const cameraLabel = replaceMode ? "Fotografuoti iš naujo" : "Fotografuoti";
  const galleryLabel = replaceMode ? "Kita iš galerijos" : "Galerija";

  return (
    <>
      {mobileCapture ? (
        <label className={`${TILE_BASE} cursor-pointer border-2 border-dashed border-[#00f2fe]/60 bg-[#1e293b] text-[#00f2fe] hover:bg-[#334155] ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={(e) => {
              void applyFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Camera className="h-7 w-7" />
          <span className="text-center text-xs font-semibold leading-tight">{cameraLabel}</span>
        </label>
      ) : (
        <label className={`${TILE_BASE} cursor-pointer border-2 border-dashed border-[#00f2fe]/60 bg-[#1e293b] text-[#00f2fe] hover:bg-[#334155] ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={(e) => {
              void applyFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Camera className="h-7 w-7" />
          <span className="text-center text-xs font-semibold leading-tight">{cameraLabel}</span>
        </label>
      )}

      <label className={`${TILE_BASE} cursor-pointer border border-slate-600 bg-[#1e293b] text-slate-200 hover:bg-[#334155] ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            void applyFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <ImageIcon className="h-7 w-7" />
        <span className="text-center text-xs font-semibold leading-tight">{galleryLabel}</span>
      </label>
    </>
  );
}
