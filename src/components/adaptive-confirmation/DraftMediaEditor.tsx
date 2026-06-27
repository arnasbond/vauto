"use client";

import { Camera, ImagePlus, Link2, Trash2, Upload } from "lucide-react";
import { useCallback, useRef } from "react";
import { parseVideoUrl } from "@/lib/video-url";

interface DraftMediaEditorProps {
  previewImage: string | null;
  videoUrl: string;
  onImageChange: (dataUrl: string | null) => void;
  onVideoUrlChange: (url: string) => void;
  requestMediaConsent: (onGranted: () => void) => void;
}

export function DraftMediaEditor({
  previewImage,
  videoUrl,
  onImageChange,
  onVideoUrlChange,
  requestMediaConsent,
}: DraftMediaEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = () => {
    requestMediaConsent(() => {
      fileInputRef.current?.click();
    });
  };

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

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
        Nuotraukos ir video
      </p>

      {previewImage ? (
        <div className="relative mb-3 overflow-hidden rounded-xl border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="Skelbimo nuotrauka"
            className="h-40 w-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemoveImage}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
            aria-label="Pašalinti nuotrauką"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openFilePicker}
          className="mb-3 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 transition hover:border-[var(--flux-teal)]/40 hover:bg-white/[0.06]"
        >
          <Upload className="h-8 w-8 text-[var(--flux-teal)]" />
          <span className="text-sm font-medium text-white/80">
            Įkelkite nuotrauką
          </span>
          <span className="text-xs text-white/40">Vilkite arba paspauskite čia</span>
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openFilePicker}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          <Camera className="h-3.5 w-3.5" />
          {previewImage ? "Keisti nuotrauką" : "Kamera / galerija"}
        </button>
        {previewImage && (
          <button
            type="button"
            onClick={() => onImageChange(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Be nuotraukos
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden
        className="listing-gallery-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
        <Link2 className="h-4 w-4 shrink-0 text-white/40" />
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => handleVideoChange(e.target.value)}
          placeholder="YouTube / TikTok nuoroda (neprivaloma)"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
        />
      </div>
    </div>
  );
}
