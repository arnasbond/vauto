"use client";

import { Images, Loader2, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageSearchCapture } from "@/components/search/ImageSearch";
import { PhotoSearchScanOverlay } from "@/components/search/PhotoSearchScanOverlay";
import { scanOverlayTimeoutMs as resolveScanOverlayTimeout } from "@/lib/ai-timeout-policy";
import {
  pickMultipleFromGallery,
  type CapturedPhoto,
} from "@/lib/native-media";
import {
  loadPhotoSearchSession,
  persistPhotoSearchSession,
  sessionToCapturedPhoto,
} from "@/lib/photo-search-session";
import { processStudioPhotos } from "@/lib/studio-photo";

export const MAX_AI_PHOTOS = 6;

export interface AiPhotoFlowResult {
  photos: string[];
  extraContext: string;
  fileName?: string;
}

export interface AiPhotoIntentChoice {
  prompt: string;
  quickReplies: string[];
}

type StudioStatus = "idle" | "processing" | "ready" | "skipped";

interface PhotoEntry {
  photo: CapturedPhoto;
  studioUrl?: string | null;
  studioStatus: StudioStatus;
}

interface AiPhotoFlowSheetProps {
  open: boolean;
  mode: "search" | "listing" | "intent";
  prefillPhoto?: CapturedPhoto | null;
  onClose: () => void;
  onSubmit: (result: AiPhotoFlowResult) => boolean | void | Promise<boolean | void>;
  busy?: boolean;
  intentChoice?: AiPhotoIntentChoice | null;
  onIntentChip?: (chip: string) => void;
  onScanTimeout?: () => void;
  onOpenBarcodeScan?: (ctx: { photos: string[] }) => void;
}

export function AiPhotoFlowSheet({
  open,
  mode,
  prefillPhoto = null,
  onClose,
  onSubmit,
  busy = false,
  intentChoice = null,
  onIntentChip,
  onScanTimeout,
  onOpenBarcodeScan,
}: AiPhotoFlowSheetProps) {
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [extraContext, setExtraContext] = useState("");
  const [mounted, setMounted] = useState(false);
  const [studioProgress, setStudioProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const studioRunRef = useRef(0);

  const photos = entries.map((e) => e.photo);

  const title =
    mode === "search"
      ? "Ieškoti pagal nuotrauką"
      : mode === "listing"
        ? "Skelbti su AI"
        : "Vision AI — nuotrauka";

  const overlayTimeoutMs = resolveScanOverlayTimeout(!!onScanTimeout);
  const progressPct =
    studioProgress && studioProgress.total > 0
      ? Math.round((studioProgress.completed / studioProgress.total) * 100)
      : 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  const runStudioPass = useCallback(
    async (nextEntries: PhotoEntry[]) => {
      if (mode !== "listing" || !nextEntries.length) return;
      const runId = ++studioRunRef.current;
      setStudioProgress({ completed: 0, total: nextEntries.length });
      setEntries((prev) =>
        prev.map((e) => ({ ...e, studioStatus: "processing" as const, studioUrl: null }))
      );

      const results = await processStudioPhotos(
        nextEntries.map((e) => e.photo.dataUrl),
        (p) => {
          if (studioRunRef.current === runId) {
            setStudioProgress({ completed: p.completed, total: p.total });
          }
        }
      );

      if (studioRunRef.current !== runId) return;

      setEntries((prev) =>
        prev.map((entry, index) => {
          const result = results[index];
          const applied = Boolean(result?.studioApplied);
          return {
            ...entry,
            studioUrl: applied ? result!.processedUrl : null,
            studioStatus: applied ? "ready" : "skipped",
          };
        })
      );
      setStudioProgress(null);
    },
    [mode]
  );

  useEffect(() => {
    if (!open) return;
    if (prefillPhoto) {
      const initial = [{ photo: prefillPhoto, studioStatus: "idle" as const }];
      setEntries(initial);
      if (mode === "listing") void runStudioPass(initial);
      return;
    }
    if (mode === "search") {
      const saved = loadPhotoSearchSession();
      if (saved) {
        setEntries([{ photo: sessionToCapturedPhoto(saved), studioStatus: "idle" }]);
        if (saved.extraContext) setExtraContext(saved.extraContext);
      }
    }
  }, [open, prefillPhoto, mode, runStudioPass]);

  const syncSearchSession = useCallback(
    (nextPhotos: CapturedPhoto[], context = extraContext) => {
      if (mode !== "search" || !nextPhotos[0]) return;
      void persistPhotoSearchSession(nextPhotos[0], context);
    },
    [mode, extraContext]
  );

  const reset = useCallback(() => {
    studioRunRef.current += 1;
    setEntries([]);
    setExtraContext("");
    setStudioProgress(null);
  }, []);

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addPhotos = (incoming: CapturedPhoto[]) => {
    if (!incoming.length) return;
    setEntries((prev) => {
      const room = MAX_AI_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const added = incoming.slice(0, room).map((photo) => ({
        photo,
        studioStatus: "idle" as const,
      }));
      const next = [...prev, ...added];
      syncSearchSession(next.map((e) => e.photo));
      if (mode === "listing") void runStudioPass(next);
      return next;
    });
  };

  const applyCapturedPhoto = (shot: CapturedPhoto) => {
    if (mode === "search") {
      const next = [{ photo: shot, studioStatus: "idle" as const }];
      setEntries(next);
      syncSearchSession([shot]);
      return;
    }
    addPhotos([shot]);
  };

  const triggerListingGallery = () => {
    if (busy) return;
    void (async () => {
      const remaining = MAX_AI_PHOTOS - entries.length;
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
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncSearchSession(next.map((e) => e.photo));
      if (mode === "listing" && next.length > 0) void runStudioPass(next);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!entries.length || busy) return;
    const result = {
      photos: entries.map((e) => e.studioUrl ?? e.photo.dataUrl),
      extraContext: extraContext.trim(),
      fileName: entries[0]?.photo.fileName,
    };
    syncSearchSession(photos, extraContext.trim());
    const ok = await onSubmit(result);
    if (ok !== false) {
      reset();
    }
  };

  if (!open || !mounted) return null;

  const ctaLabel =
    mode === "search"
      ? "Ieškoti panašių"
      : mode === "listing"
        ? "Sukurti skelbimą"
        : "Tęsti su AI";

  const showInlineSourcePickers =
    mode === "search" ? photos.length === 0 : photos.length < MAX_AI_PHOTOS;
  const showSearchReplacePickers = mode === "search" && photos.length > 0;
  const studioBusy = Boolean(studioProgress);

  const sheet = (
    <>
      <div
        className="ai-photo-flow-sheet fixed inset-0 z-[9998] flex max-h-[100dvh] min-h-[100dvh] w-full flex-col touch-manipulation"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="ai-photo-flow-sheet"
      >
        <header className="ai-photo-flow-header shrink-0 flex items-center gap-3 border-b px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-card-bg)] disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="font-display flex-1 text-center text-base font-bold text-[var(--vauto-text-main)] pr-9">
            {title}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-32">
          {mode === "listing" && entries.length > 0 && (
            <div className="ai-photo-studio-progress mb-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-[var(--vauto-text-main)]">
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-[var(--vauto-primary)]" />
                  {studioBusy
                    ? `Studio fonas: ${studioProgress!.completed}/${studioProgress!.total}`
                    : "Studio fonas paruoštas"}
                </span>
                {studioBusy && <span>{progressPct}%</span>}
              </div>
              <div className="ai-photo-studio-progress-track h-1.5 overflow-hidden rounded-full">
                <div
                  className="ai-photo-studio-progress-bar h-full rounded-full transition-all duration-300"
                  style={{ width: `${studioBusy ? progressPct : 100}%` }}
                />
              </div>
            </div>
          )}

          <p className="mb-3 text-sm font-medium text-[var(--vauto-text-main)]">Nuotraukos</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((entry, index) => {
              const displayUrl = entry.studioUrl ?? entry.photo.dataUrl;
              const isProcessing = entry.studioStatus === "processing";
              return (
                <div
                  key={`${entry.photo.dataUrl.slice(0, 32)}-${index}`}
                  className="ai-photo-flow-card relative aspect-square overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrl}
                    alt={`Nuotrauka ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {entry.studioStatus === "ready" && (
                    <span className="ai-photo-studio-badge absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      Studio
                    </span>
                  )}
                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--vauto-bg)]/55 backdrop-blur-[1px]">
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--vauto-primary)]" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    disabled={busy || studioBusy}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--vauto-bg)]/90 text-[var(--vauto-text-muted)] shadow-sm hover:text-[var(--vauto-red,#ef4444)] disabled:opacity-50"
                    aria-label="Pašalinti nuotrauką"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}

            {showInlineSourcePickers &&
              (mode === "search" ? (
                <ImageSearchCapture disabled={busy || studioBusy} onCapture={applyCapturedPhoto} />
              ) : (
                <>
                  <ImageSearchCapture
                    disabled={busy || studioBusy}
                    onCapture={applyCapturedPhoto}
                  />
                  <button
                    type="button"
                    onClick={triggerListingGallery}
                    disabled={busy || studioBusy}
                    className="ai-photo-flow-card flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border px-2 text-[var(--vauto-text-main)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Images className="h-6 w-6 text-[var(--vauto-primary)]" />
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
                disabled={busy || studioBusy}
                onCapture={applyCapturedPhoto}
                replaceMode
              />
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
            {mode === "listing"
              ? "Pasirinkite kelias nuotraukas iš karto — fonas automatiškai išvalomas į neutralų automobilių salono stilių."
              : mode === "search" && photos.length === 0
                ? "Pasirinkite „Fotografuoti“ arba „Galerija“."
                : "Pridėkite nuotraukas iš skirtingų kampų."}
          </p>

          {photos.length > 0 && photos.length < 4 && mode === "listing" && (
            <p className="mt-1 text-xs text-[var(--vauto-primary)]">
              Sėkmingi skelbimai dažnai turi 4 ar daugiau nuotraukų.
            </p>
          )}

          {onOpenBarcodeScan && (
            <button
              type="button"
              data-testid="ai-photo-barcode-scan"
              onClick={() =>
                onOpenBarcodeScan({
                  photos: entries.map((e) => e.studioUrl ?? e.photo.dataUrl),
                })
              }
              disabled={busy || studioBusy}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--vauto-primary)] bg-[color-mix(in_srgb,var(--vauto-primary)_8%,transparent)] px-4 py-3 text-sm font-bold text-[var(--vauto-text-main)] shadow-sm transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_14%,transparent)] disabled:opacity-50"
            >
              📊 Skenuoti brūkšninį kodą iš etiketės
            </button>
          )}

          <label className="mt-6 block text-sm font-medium text-[var(--vauto-text-main)]">
            Kas nematoma nuotraukose?{" "}
            <span className="font-normal text-[var(--vauto-text-muted)]">(Neprivaloma)</span>
          </label>
          <textarea
            value={extraContext}
            onChange={(e) => handleExtraContextChange(e.target.value)}
            disabled={busy || studioBusy}
            rows={4}
            placeholder="Pvz.: prekės ženklas ir modelis, matmenys, būklė, kas įeina į komplektą."
            className="mt-2 w-full resize-none rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-[#4b5563] focus:border-[var(--vauto-primary)] focus:ring-1 focus:ring-[var(--vauto-primary)] disabled:opacity-60"
          />
        </div>

        <div className="ai-photo-flow-footer shrink-0 border-t p-4 pb-[max(8rem,env(safe-area-inset-bottom,0px))]">
          {intentChoice && intentChoice.quickReplies.length > 0 ? (
            <div className="space-y-3">
              <p className="text-center text-sm font-medium leading-snug text-[var(--vauto-text-main)]">
                {intentChoice.prompt}
              </p>
              <div className="flex flex-col gap-2">
                {intentChoice.quickReplies.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onIntentChip?.(chip)}
                    disabled={busy}
                    className="flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl border border-[var(--vauto-primary)] bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)] px-4 py-3 text-sm font-semibold text-[var(--vauto-text-main)] transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_18%,transparent)] disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!entries.length || busy || studioBusy}
                className="flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3.5 text-sm font-semibold text-[var(--vauto-primary-contrast)] shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {busy ? "Analizuojama…" : studioBusy ? "Ruošiamas studio fonas…" : ctaLabel}
              </button>
            </>
          )}
        </div>
      </div>

      <PhotoSearchScanOverlay
        active={busy}
        timeoutMs={overlayTimeoutMs}
        onTimeout={onScanTimeout}
      />
    </>
  );

  return createPortal(sheet, document.body);
}
