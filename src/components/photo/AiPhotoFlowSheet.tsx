"use client";

import { Camera, ImageIcon, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import {
  capturePhotoFromSource,
  pickCameraPhotoWeb,
  pickGalleryPhotoWeb,
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
  prefillPhoto?: CapturedPhoto | null;
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
      ? "border-2 border-dashed border-[#00f2fe]/60 bg-[#1e293b] text-[#00f2fe] hover:bg-[#334155]"
      : "border border-slate-600 bg-[#1e293b] text-slate-200 hover:bg-[#334155]";

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
  prefillPhoto = null,
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

  useEffect(() => {
    if (open && prefillPhoto) {
      setPhotos([prefillPhoto]);
    }
  }, [open, prefillPhoto]);

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

  const applyCapturedPhoto = async (shot: CapturedPhoto) => {
    if (mode === "search") {
      setPhotos([shot]);
      return;
    }
    addPhotos([shot]);
  };

  /** Must not setState before opening camera — mobile browsers require sync gesture. */
  const triggerCamera = () => {
    if (busy) return;
    const pending = Capacitor.isNativePlatform()
      ? capturePhotoFromSource("camera")
      : pickCameraPhotoWeb();
    void pending.then((shot) => {
      if (shot) void applyCapturedPhoto(shot);
    });
  };

  const triggerGallery = () => {
    if (busy) return;
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
      void pickGalleryPhotoWeb().then((shot) => {
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

  const handleSourceSelect = (source: "camera" | "gallery") => {
    if (source === "camera") triggerCamera();
    else triggerGallery();
    setSourceOpen(false);
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

  const showInlineSourcePickers =
    mode === "search"
      ? photos.length === 0
      : photos.length < MAX_AI_PHOTOS;
  const showSearchReplacePickers = mode === "search" && photos.length > 0;

  const sheet = (
    <>
      <div
        className="fixed inset-0 z-[9998] flex h-full min-h-screen w-full flex-col overflow-y-auto bg-[#0a1128] text-white"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-slate-700 bg-[#0a1128] px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="font-display flex-1 text-center text-base font-bold text-white pr-9">
            {title}
          </h2>
        </header>

        <div className="flex-1 px-4 py-5 pb-28">
          <p className="mb-3 text-sm font-medium text-slate-200">Nuotraukos</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <div
                key={`${photo.dataUrl.slice(0, 32)}-${index}`}
                className="relative aspect-square overflow-hidden rounded-xl border border-slate-600 bg-[#1e293b]"
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
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#0a1128]/90 text-slate-300 shadow-sm hover:text-[#ef4444] disabled:opacity-50"
                  aria-label="Pašalinti nuotrauką"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {showInlineSourcePickers && (
              <>
                <PhotoSourceTile
                  label="Fotografuoti"
                  icon={<Camera className="h-7 w-7" />}
                  onClick={triggerCamera}
                  disabled={busy}
                  variant="primary"
                />
                <PhotoSourceTile
                  label="Galerija"
                  icon={<ImageIcon className="h-6 w-6" />}
                  onClick={triggerGallery}
                  disabled={busy}
                  variant="secondary"
                />
              </>
            )}
          </div>

          {showSearchReplacePickers && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <PhotoSourceTile
                label="Fotografuoti iš naujo"
                icon={<Camera className="h-6 w-6" />}
                onClick={triggerCamera}
                disabled={busy}
                variant="primary"
              />
              <PhotoSourceTile
                label="Kita iš galerijos"
                icon={<ImageIcon className="h-5 w-5" />}
                onClick={triggerGallery}
                disabled={busy}
                variant="secondary"
              />
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            {mode === "search" && photos.length === 0
              ? "Pasirinkite „Fotografuoti“ (kamera) arba „Galerija“ — nuotrauka bus iš karto naudojama paieškai."
              : mode === "search"
                ? "Norėdami pakeisti nuotrauką, pasirinkite „Fotografuoti iš naujo“ arba „Kita iš galerijos“."
                : "Pridėkite nuotraukas iš skirtingų kampų — fotografuokite arba pasirinkite iš galerijos."}
          </p>

          {photos.length > 0 && photos.length < 4 && mode === "listing" && (
            <p className="mt-1 text-xs text-[#00f2fe]">
              Sėkmingi skelbimai dažnai turi 4 ar daugiau nuotraukų.
            </p>
          )}

          <label className="mt-6 block text-sm font-medium text-slate-200">
            Kas nematoma nuotraukose?{" "}
            <span className="font-normal text-slate-500">(Neprivaloma)</span>
          </label>
          <textarea
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            disabled={busy}
            rows={4}
            placeholder="Pvz.: prekės ženklas ir modelis, matmenys, būklė, kas įeina į komplektą."
            className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-[#1e293b] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#00f2fe] focus:ring-1 focus:ring-[#00f2fe] disabled:opacity-60"
          />
        </div>

        <div className="sticky bottom-0 border-t border-slate-700 bg-[#0a1128] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
