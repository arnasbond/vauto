"use client";

import { Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageSearchCapture } from "@/components/search/ImageSearch";
import { PhotoSearchScanOverlay } from "@/components/search/PhotoSearchScanOverlay";
import {
  pickMultipleFromGallery,
  type CapturedPhoto,
} from "@/lib/native-media";
import {
  loadPhotoSearchSession,
  persistPhotoSearchSession,
  sessionToCapturedPhoto,
} from "@/lib/photo-search-session";

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
  onSubmit: (result: AiPhotoFlowResult) => boolean | void | Promise<boolean | void>;
  busy?: boolean;
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
  const [mounted, setMounted] = useState(false);

  const title =
    mode === "search" ? "Ieškoti pagal nuotrauką" : "Skelbti su AI";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (prefillPhoto) {
      setPhotos([prefillPhoto]);
      return;
    }
    if (mode === "search") {
      const saved = loadPhotoSearchSession();
      if (saved) {
        setPhotos([sessionToCapturedPhoto(saved)]);
        if (saved.extraContext) setExtraContext(saved.extraContext);
      }
    }
  }, [open, prefillPhoto, mode]);

  const syncSearchSession = useCallback(
    (nextPhotos: CapturedPhoto[], context = extraContext) => {
      if (mode !== "search" || !nextPhotos[0]) return;
      void persistPhotoSearchSession(nextPhotos[0], context);
    },
    [mode, extraContext]
  );

  const reset = useCallback(() => {
    setPhotos([]);
    setExtraContext("");
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
      const next = [...prev, ...incoming.slice(0, room)];
      syncSearchSession(next);
      return next;
    });
  };

  const applyCapturedPhoto = (shot: CapturedPhoto) => {
    if (mode === "search") {
      setPhotos([shot]);
      syncSearchSession([shot]);
      return;
    }
    addPhotos([shot]);
  };

  const triggerListingGallery = () => {
    if (busy) return;
    void (async () => {
      const remaining = MAX_AI_PHOTOS - photos.length;
      const picked = await pickMultipleFromGallery(remaining);
      addPhotos(picked);
    })();
  };

  const handleExtraContextChange = (value: string) => {
    setExtraContext(value);
    if (mode === "search" && photos[0]) {
      void persistPhotoSearchSession(photos[0], value);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncSearchSession(next);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!photos.length || busy) return;
    const result = {
      photos: photos.map((p) => p.dataUrl),
      extraContext: extraContext.trim(),
      fileName: photos[0]?.fileName,
    };
    syncSearchSession(photos, extraContext.trim());
    const ok = await onSubmit(result);
    if (ok !== false) {
      reset();
    }
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

            {showInlineSourcePickers &&
              (mode === "search" ? (
                <ImageSearchCapture
                  disabled={busy}
                  onCapture={applyCapturedPhoto}
                />
              ) : (
                <>
                  <ImageSearchCapture
                    disabled={busy}
                    onCapture={applyCapturedPhoto}
                  />
                  <button
                    type="button"
                    onClick={triggerListingGallery}
                    disabled={busy}
                    className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-[#1e293b] px-2 text-slate-200 transition hover:bg-[#334155] disabled:opacity-50"
                  >
                    <span className="text-center text-xs font-semibold leading-tight">
                      Kelios iš galerijos
                    </span>
                  </button>
                </>
              ))}
          </div>

          {showSearchReplacePickers && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ImageSearchCapture
                disabled={busy}
                onCapture={applyCapturedPhoto}
                replaceMode
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
            onChange={(e) => handleExtraContextChange(e.target.value)}
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

      <PhotoSearchScanOverlay active={busy} />
    </>
  );

  return createPortal(sheet, document.body);
}
