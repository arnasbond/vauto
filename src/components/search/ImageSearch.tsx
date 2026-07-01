"use client";

import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
  capturePhotoFromSource,
  pickCameraPhotoWeb,
  pickGalleryPhotoWeb,
  type CapturedPhoto,
} from "@/lib/native-media";
import { Capacitor } from "@capacitor/core";

const TILE_BASE =
  "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl px-2 transition disabled:opacity-50";

const TILE_CAMERA = `${TILE_BASE} border-2 border-dashed border-[var(--vauto-primary)] bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)] text-[var(--vauto-text-main)] hover:bg-[color-mix(in_srgb,var(--vauto-primary)_14%,transparent)]`;

const TILE_GALLERY = `${TILE_BASE} border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] text-[var(--vauto-text-main)] hover:bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)]`;

export interface ImageSearchCaptureProps {
  disabled?: boolean;
  onCapture: (photo: CapturedPhoto) => void;
  replaceMode?: boolean;
}

/**
 * Photo search capture — camera and gallery use isolated handlers.
 * Native: Capacitor Camera (Camera vs Photos). Web: capture="environment" vs gallery picker.
 */
export function ImageSearchCapture({
  disabled,
  onCapture,
  replaceMode = false,
}: ImageSearchCaptureProps) {
  const [cameraBusy, setCameraBusy] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);

  const cameraLabel = replaceMode ? "Fotografuoti iš naujo" : "Fotografuoti";
  const galleryLabel = replaceMode ? "Kita iš galerijos" : "Galerija";

  const handleCamera = useCallback(() => {
    if (disabled || cameraBusy) return;

    setCameraBusy(true);
    void (async () => {
      try {
        const photo = Capacitor.isNativePlatform()
          ? await capturePhotoFromSource("camera")
          : await pickCameraPhotoWeb();
        if (photo) onCapture(photo);
      } finally {
        setCameraBusy(false);
      }
    })();
  }, [cameraBusy, disabled, onCapture]);

  const handleGallery = useCallback(() => {
    if (disabled || galleryBusy) return;

    setGalleryBusy(true);
    void (async () => {
      try {
        const photo = Capacitor.isNativePlatform()
          ? await capturePhotoFromSource("gallery")
          : await pickGalleryPhotoWeb();
        if (photo) onCapture(photo);
      } finally {
        setGalleryBusy(false);
      }
    })();
  }, [disabled, galleryBusy, onCapture]);

  return (
    <>
      <button
        type="button"
        onClick={handleCamera}
        disabled={disabled || cameraBusy}
        data-testid="image-search-camera"
        className={TILE_CAMERA}
        aria-label={cameraLabel}
      >
        {cameraBusy ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <Camera className="h-7 w-7" />
        )}
        <span className="text-center text-xs font-semibold leading-tight">{cameraLabel}</span>
      </button>

      <button
        type="button"
        onClick={handleGallery}
        disabled={disabled || galleryBusy}
        data-testid="image-search-gallery"
        className={TILE_GALLERY}
        aria-label={galleryLabel}
      >
        {galleryBusy ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <ImageIcon className="h-7 w-7" />
        )}
        <span className="text-center text-xs font-semibold leading-tight">{galleryLabel}</span>
      </button>
    </>
  );
}
