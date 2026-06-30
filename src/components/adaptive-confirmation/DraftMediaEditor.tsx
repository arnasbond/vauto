"use client";

import { Camera, ImagePlus, Link2, Trash2, Upload } from "lucide-react";
import { useCallback, useId } from "react";
import { parseVideoUrl } from "@/lib/video-url";
import { getSafeImageUrl } from "@/lib/utils";
import { cn } from "@/lib/cn";

interface DraftMediaEditorProps {
  previewImage: string | null;
  videoUrl: string;
  onImageChange: (dataUrl: string | null) => void;
  onVideoUrlChange: (url: string) => void;
  appearance?: "dark" | "light";
}

export function DraftMediaEditor({
  previewImage,
  videoUrl,
  onImageChange,
  onVideoUrlChange,
  appearance = "dark",
}: DraftMediaEditorProps) {
  const fileInputId = useId();
  const replaceInputId = useId();

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => onImageChange(reader.result as string);
      reader.readAsDataURL(file);
    },
    [onImageChange]
  );

  const handleRemoveImage = () => {
    const vid = parseVideoUrl(videoUrl);
    onImageChange(vid.thumbnail ?? null);
  };

  const handleVideoChange = (url: string) => {
    onVideoUrlChange(url);
    const vid = parseVideoUrl(url);
    if (vid.thumbnail && !previewImage?.startsWith("data:")) {
      onImageChange(vid.thumbnail);
    }
  };

  const shellClass =
    appearance === "light"
      ? "rounded-2xl border border-slate-200 bg-white p-4"
      : "rounded-2xl border border-white/5 bg-black/20 p-4";
  const headingClass =
    appearance === "light"
      ? "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-800"
      : "mb-3 text-xs font-semibold uppercase tracking-wider text-white/50";
  const uploadBtnClass =
    appearance === "light"
      ? "relative mb-3 flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 transition hover:border-[var(--vauto-primary)] hover:bg-slate-100"
      : "relative mb-3 flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 transition hover:border-[var(--flux-teal)]/40 hover:bg-white/[0.06]";
  const uploadTextClass =
    appearance === "light" ? "text-sm font-medium text-slate-800" : "text-sm font-medium text-white/80";
  const uploadHintClass =
    appearance === "light" ? "text-xs text-slate-500" : "text-xs text-white/40";
  const actionBtnClass =
    appearance === "light"
      ? "relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
      : "relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10";
  const videoRowClass =
    appearance === "light"
      ? "mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
      : "mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5";
  const videoInputClass =
    appearance === "light"
      ? "min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
      : "min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30";
  const fileInputOverlayClass =
    "draft-media-file-input absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0";

  return (
    <div className={cn(shellClass, "relative z-20 pointer-events-auto")}>
      <p className={headingClass}>Nuotraukos ir video</p>

      {previewImage ? (
        <div className="relative mb-3 overflow-hidden rounded-xl border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getSafeImageUrl(previewImage)}
            alt="Skelbimo nuotrauka"
            className="h-40 w-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemoveImage}
            className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
            aria-label="Pašalinti nuotrauką"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label htmlFor={fileInputId} className={cn(uploadBtnClass, "pointer-events-auto")}>
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            multiple
            className={fileInputOverlayClass}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Upload className="pointer-events-none h-8 w-8 text-[var(--flux-teal)]" />
          <span className={cn(uploadTextClass, "pointer-events-none")}>Įkelkite nuotrauką</span>
          <span className={cn(uploadHintClass, "pointer-events-none")}>
            Vilkite arba paspauskite čia
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <label htmlFor={previewImage ? replaceInputId : fileInputId} className={actionBtnClass}>
          {!previewImage ? null : (
            <input
              id={replaceInputId}
              type="file"
              accept="image/*"
              multiple
              className={fileInputOverlayClass}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          )}
          <Camera className="pointer-events-none h-3.5 w-3.5" />
          <span className="pointer-events-none">
            {previewImage ? "Keisti nuotrauką" : "Kamera / galerija"}
          </span>
        </label>
        {previewImage && (
          <button type="button" onClick={() => onImageChange(null)} className={actionBtnClass}>
            <ImagePlus className="h-3.5 w-3.5" />
            Be nuotraukos
          </button>
        )}
      </div>

      <div className={videoRowClass}>
        <Link2
          className={`h-4 w-4 shrink-0 ${appearance === "light" ? "text-slate-400" : "text-white/40"}`}
        />
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => handleVideoChange(e.target.value)}
          placeholder="YouTube / TikTok nuoroda (neprivaloma)"
          className={videoInputClass}
        />
      </div>
    </div>
  );
}
