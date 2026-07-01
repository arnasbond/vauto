"use client";

import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  capturePhotoFromSource,
  pickCameraPhotoWeb,
  pickGalleryPhotoWeb,
  type CapturedPhoto,
} from "@/lib/native-media";
import { cn } from "@/lib/cn";

export interface ImageSearchCaptureProps {
  disabled?: boolean;
  onCapture: (photo: CapturedPhoto) => void;
  replaceMode?: boolean;
}

/**
 * Vision AI capture tiles — camera and gallery use isolated handlers.
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
        className={cn(
          "vauto-capture-tile vauto-capture-tile--camera",
          (disabled || cameraBusy) && "pointer-events-none opacity-50"
        )}
        aria-label={cameraLabel}
      >
        {cameraBusy ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : (
          <Camera className="h-7 w-7 text-primary" />
        )}
        <span>{cameraLabel}</span>
      </button>

      <button
        type="button"
        onClick={handleGallery}
        disabled={disabled || galleryBusy}
        data-testid="image-search-gallery"
        className={cn(
          "vauto-capture-tile vauto-capture-tile--gallery",
          (disabled || galleryBusy) && "pointer-events-none opacity-50"
        )}
        aria-label={galleryLabel}
      >
        {galleryBusy ? (
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-7 w-7 text-muted-foreground" />
        )}
        <span>{galleryLabel}</span>
      </button>
    </>
  );
}
