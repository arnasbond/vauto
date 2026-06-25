"use client";

import { Camera, ImageIcon, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import {
  capturePhotoFromSource,
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

function PhotoSourceTile({
  label,
  icon,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const primary =
    variant === "primary"
      ? "border-2 border-dashed border-[#1167b1] bg-[#eef6ff] text-[#1167b1] hover:bg-[#dbeafe]"
      : "border border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl px-2 transition disabled:opacity-50 ${primary}`}
    >
      {icon}
      <span className="text-center text-xs font-semibold leading-tight">{label}</span>
    </button>
  );
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

  const title =
    mode === "search" ? "Ieškoti pagal nuotrauką" : "Skelbti su AI";

  useEffect(() => {
    setMounted(true);
  }, []);

  const reset = useCallback(() => {
    setPhotos([]);
    setExtraContext("");
    setSourceOpen(false);
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
      const pending = capturePhotoFromSource("camera");
      void pending.then((shot) => {
        if (shot) void applyCapturedPhoto(shot);
      });
      return;
    }

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        const remaining = MAX_AI_PHOTOS - photos.length;
        const picked = await pickMultipleFromGallery(remaining);
        if (mode === "search" && picked[0]) {
          await applyCapturedPhoto(picked[0]);
          return;
        }
        addPhotos(picked);
      })();
      return;
    }

    if (mode === "search") {
      void capturePhotoFromSource("gallery").then((shot) => {
        if (shot) void applyCapturedPhoto(shot);
      });
      return;
    }

    void (async () => {
      const remaining = MAX_AI_PHOTOS - photos.length;
      const picked = await pickMultipleFromGallery(remaining);
      addPhotos(picked);
    })();
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

  const showInlineSourcePickers = photos.length < MAX_AI_PHOTOS;
  const showSearchTiles = mode === "search" && photos.length === 0;

  const sheet = (
    <>
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

            {showInlineSourcePickers && showSearchTiles && (
              <>
                <PhotoSourceTile
                  label="Fotografuoti"
                  icon={<Camera className="h-7 w-7" />}
                  onClick={() => handleSourceSelect("camera")}
                  disabled={busy}
                  variant="primary"
                />
                <PhotoSourceTile
                  label="Galerija"
                  icon={<ImageIcon className="h-6 w-6" />}
                  onClick={() => handleSourceSelect("gallery")}
                  disabled={busy}
                  variant="secondary"
                />
              </>
            )}

            {showInlineSourcePickers && !showSearchTiles && mode === "listing" && (
              <>
                <PhotoSourceTile
                  label="Fotografuoti"
                  icon={<Camera className="h-7 w-7" />}
                  onClick={() => handleSourceSelect("camera")}
                  disabled={busy}
                  variant="primary"
                />
                <PhotoSourceTile
                  label="Galerija"
                  icon={<ImageIcon className="h-6 w-6" />}
                  onClick={() => handleSourceSelect("gallery")}
                  disabled={busy}
                  variant="secondary"
                />
              </>
            )}

            {showInlineSourcePickers && !showSearchTiles && mode === "search" && (
              <button
                type="button"
                onClick={() => setSourceOpen(true)}
                disabled={busy}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#d1d5db] bg-[#fafafa] text-[#1167b1] transition hover:border-[#1167b1] hover:bg-[#eef6ff] disabled:opacity-50"
              >
                <Plus className="h-7 w-7" />
                <span className="text-xs font-semibold">Pridėti</span>
              </button>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#6b7280]">
            {mode === "search" && photos.length === 0
              ? "Pasirinkite „Fotografuoti“ (kamera) arba „Galerija“ — nuotrauka bus iš karto naudojama paieškai."
              : mode === "search"
                ? "Galite pridėti kitą nuotrauką per meniu „Pridėti“."
                : "Pridėkite nuotraukas iš skirtingų kampų — fotografuokite arba pasirinkite iš galerijos."}
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
