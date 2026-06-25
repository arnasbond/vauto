"use client";

import { Camera, ImageIcon, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import {
  capturePhotoFromSource,
  NATIVE_FILE_INPUT_CLASS,
  pickMultipleFromGallery,
  type CapturedPhoto,
} from "@/lib/native-media";

export const MAX_AI_PHOTOS = 6;

export interface AiPhotoFlowResult {
  photos: string[];
  extraContext: string;
  fileName?: string;
}

interface AiPhotoFlowSheetProps {
  open: boolean;
  mode: "search" | "listing";
  onClose: () => void;
  onSubmit: (result: AiPhotoFlowResult) => void | Promise<void>;
  busy?: boolean;
}

function readFileAsDataUrl(file: File): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        resolve(null);
        return;
      }
      resolve({ dataUrl, fileName: file.name });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function AiPhotoFlowSheet({
  open,
  mode,
  onClose,
  onSubmit,
  busy = false,
}: AiPhotoFlowSheetProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [extraContext, setExtraContext] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const title =
    mode === "search" ? "Ieškoti pagal nuotrauką" : "Skelbti su AI";

  useEffect(() => {
    setMounted(true);
  }, []);

  const reset = useCallback(() => {
    setPhotos([]);
    setExtraContext("");
    setSourceOpen(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addPhotos = (incoming: CapturedPhoto[]) => {
    if (!incoming.length) return;
    setPhotos((prev) => {
      const room = MAX_AI_PHOTOS - prev.length;
      if (room <= 0) return prev;
      return [...prev, ...incoming.slice(0, room)];
    });
  };

  const runSearchWithPhoto = async (photo: CapturedPhoto) => {
    await onSubmit({
      photos: [photo.dataUrl],
      extraContext: extraContext.trim(),
      fileName: photo.fileName,
    });
    reset();
  };

  const handleCameraFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;

    const captured = await readFileAsDataUrl(file);
    if (!captured) return;

    if (mode === "search") {
      setPhotos([captured]);
      await runSearchWithPhoto(captured);
      return;
    }

    addPhotos([captured]);
  };

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || busy) return;

    const captured = (
      await Promise.all(files.map((file) => readFileAsDataUrl(file)))
    ).filter((item): item is CapturedPhoto => item !== null);

    if (!captured.length) return;

    if (mode === "search") {
      setPhotos([captured[0]!]);
      await runSearchWithPhoto(captured[0]!);
      return;
    }

    addPhotos(captured);
  };

  /** Direct camera activation — must stay synchronous inside user gesture on mobile. */
  const triggerNativeCameraInput = () => {
    if (busy) return;
    cameraInputRef.current?.click();
  };

  const openListingPhotoPicker = () => {
    if (busy) return;
    if (Capacitor.isNativePlatform()) {
      setSourceOpen(true);
      return;
    }
    triggerNativeCameraInput();
  };

  const applyCapturedPhoto = async (shot: CapturedPhoto) => {
    if (mode === "search") {
      setPhotos([shot]);
      await runSearchWithPhoto(shot);
      return;
    }
    addPhotos([shot]);
  };

  const handleSourceSelect = (source: "camera" | "gallery") => {
    setSourceOpen(false);
    if (source === "camera") {
      if (Capacitor.isNativePlatform()) {
        void capturePhotoFromSource("camera").then((shot) => {
          if (shot) void applyCapturedPhoto(shot);
        });
        return;
      }
      triggerNativeCameraInput();
      return;
    }

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        const remaining = MAX_AI_PHOTOS - photos.length;
        const picked = await pickMultipleFromGallery(remaining);
        addPhotos(picked);
      })();
      return;
    }

    galleryInputRef.current?.click();
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!photos.length || busy) return;
    await onSubmit({
      photos: photos.map((p) => p.dataUrl),
      extraContext: extraContext.trim(),
      fileName: photos[0]?.fileName,
    });
    reset();
  };

  if (!open || !mounted) return null;

  const ctaLabel =
    mode === "search" ? "Ieškoti panašių" : "Sukurti skelbimą";

  const sheet = (
    <>
      <input
        ref={cameraInputRef}
        id="photo-search-input"
        type="file"
        accept="image/*"
        capture="environment"
        className={NATIVE_FILE_INPUT_CLASS}
        tabIndex={-1}
        onChange={(e) => void handleCameraFileChange(e)}
      />
      <input
        ref={galleryInputRef}
        id="photo-search-gallery-input"
        type="file"
        accept="image/*"
        multiple={mode === "listing"}
        className={NATIVE_FILE_INPUT_CLASS}
        tabIndex={-1}
        onChange={(e) => void handleGalleryFileChange(e)}
      />

      <div
        className="fixed inset-0 z-[9998] flex h-full min-h-screen w-full flex-col overflow-y-auto bg-white"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="font-display flex-1 text-center text-base font-bold text-[#111827] pr-9">
            {title}
          </h2>
        </header>

        <div className="flex-1 px-4 py-5 pb-28">
          <p className="mb-3 text-sm font-medium text-[#374151]">Nuotraukos</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <div
                key={`${photo.dataUrl.slice(0, 32)}-${index}`}
                className="relative aspect-square overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f9fafb]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.dataUrl}
                  alt={`Nuotrauka ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  disabled={busy}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[#6b7280] shadow-sm hover:text-[#ef4444] disabled:opacity-50"
                  aria-label="Pašalinti nuotrauką"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {photos.length < MAX_AI_PHOTOS && (
              <>
                <label
                  htmlFor="photo-search-input"
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#d1d5db] bg-[#fafafa] text-[#1167b1] transition hover:border-[#1167b1] hover:bg-[#eef6ff]"
                >
                  <Camera className="h-7 w-7" />
                  <span className="text-xs font-semibold">Pridėti</span>
                </label>
                {mode === "listing" && (
                  <button
                    type="button"
                    onClick={openListingPhotoPicker}
                    disabled={busy}
                    className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:bg-[#f9fafb] disabled:opacity-50"
                  >
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs font-medium">Galerija</span>
                  </button>
                )}
              </>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#6b7280]">
            {mode === "search"
              ? "Paspauskite „Pridėti“ — atsidarys kamera. Galite fotografuoti daiktą ir iškart ieškoti panašių skelbimų."
              : "Pridėkite nuotraukas iš skirtingų kampų ant paprasto fono, įskaitant prekės ženklą ar etiketę."}
          </p>

          {photos.length > 0 && photos.length < 4 && mode === "listing" && (
            <p className="mt-1 text-xs text-[#1167b1]">
              Sėkmingi skelbimai dažnai turi 4 ar daugiau nuotraukų.
            </p>
          )}

          <label className="mt-6 block text-sm font-medium text-[#374151]">
            Kas nematoma nuotraukose?{" "}
            <span className="font-normal text-[#9ca3af]">(Neprivaloma)</span>
          </label>
          <textarea
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            disabled={busy}
            rows={4}
            placeholder="Pvz.: prekės ženklas ir modelis, matmenys, būklė, kas įeina į komplektą."
            className="mt-2 w-full resize-none rounded-xl border border-[#d1d5db] px-3 py-2.5 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af] focus:border-[#1167b1] focus:ring-1 focus:ring-[#1167b1] disabled:opacity-60"
          />
        </div>

        <div className="sticky bottom-0 border-t border-[#e5e7eb] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!photos.length || busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5a9a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy ? "Analizuojama…" : ctaLabel}
          </button>
        </div>
      </div>

      <PhotoSourceSheet
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onSelect={(source) => handleSourceSelect(source)}
      />
    </>
  );

  return createPortal(sheet, document.body);
}
