"use client";

import { Camera, Link2, Mic, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useVauto } from "@/context/VautoContext";

export function SellerUploadPanel() {
  const { submitSellerContent, startVoiceFlow, sellerStep, requestMediaConsent } =
    useVauto();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const busy =
    sellerStep !== "idle" && sellerStep !== "published";

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = () => {
    if (!text.trim() && !preview && !videoUrl.trim()) return;
    submitSellerContent({
      text: text.trim() || undefined,
      imageDataUrl: preview,
      videoUrl: videoUrl.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-base font-medium text-[var(--vauto-text)]">
        Kas tai per daiktas ar paslauga?
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragOver
            ? "border-[var(--vauto-blue)] bg-[var(--vauto-blue)]/5"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Peržiūra"
            className="mx-auto max-h-40 rounded-xl object-cover"
          />
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-[var(--vauto-blue)]" />
            <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
              Vilkite nuotrauką ar video čia
            </p>
          </>
        )}
        <label
          className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[var(--vauto-blue)] shadow-sm"
          onClick={(e) => {
            e.preventDefault();
            requestMediaConsent(() => {
              document.getElementById("seller-media-input")?.click();
            });
          }}
        >
          <Camera className="h-4 w-4" />
          Kamera / galerija
          <input
            id="seller-media-input"
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder="Laisvas aprašymas: „Parduodu dviratį Panevėžyje, 150€, tel. +3706...“"
        rows={4}
        className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-blue)] focus:ring-2 focus:ring-[var(--vauto-blue)]/20"
      />

      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <Link2 className="h-5 w-5 shrink-0 text-[var(--vauto-text-muted)]" />
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          disabled={busy}
          placeholder="YouTube / TikTok nuoroda (neprivaloma)"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={startVoiceFlow}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-medium text-[var(--vauto-text)] disabled:opacity-50"
        >
          <Mic className="h-5 w-5 text-[var(--vauto-red)]" />
          Balsu
        </button>
        <button
          type="button"
          disabled={busy || (!text.trim() && !preview && !videoUrl.trim())}
          onClick={handleSubmit}
          className="flex-[2] rounded-2xl bg-[var(--vauto-orange)] py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
        >
          Sukurti skelbimą
        </button>
      </div>
    </div>
  );
}
