"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import { useVauto } from "@/context/VautoContext";
import {
  capturePhotoFromSource,
  compressDataUrl,
  resolveImageForUpload,
} from "@/lib/native-media";
import {
  API_AVATAR_DATA_URL_MAX,
  DEFAULT_USER_AVATAR,
  isOversizedAvatar,
} from "@/lib/avatar-url";

const DEFAULT_AVATAR = DEFAULT_USER_AVATAR;

function avatarSrcWithCacheBust(url: string, cacheBust: number): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${cacheBust || Date.now()}`;
}

interface ProfileAvatarEditorProps {
  avatar: string;
  name: string;
}

export function ProfileAvatarEditor({ avatar, name }: ProfileAvatarEditorProps) {
  const { updateUser, requestMediaConsent, showToast } = useVauto();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [committedAvatar, setCommittedAvatar] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  useEffect(() => {
    if (committedAvatar && avatar === committedAvatar) {
      setCommittedAvatar(null);
    }
  }, [avatar, committedAvatar]);

  const displaySrc = preview || committedAvatar || avatar || DEFAULT_AVATAR;
  const imgSrc = avatarSrcWithCacheBust(displaySrc, cacheBust);

  const uploadAvatar = useCallback(
    async (dataUrl: string) => {
      setUploading(true);
      setPreview(dataUrl);
      try {
        const resolved = await resolveImageForUpload(dataUrl);
        if (!resolved) {
          showToast("Nepavyko apdoroti nuotraukos.", "error");
          setPreview(null);
          return;
        }

        let finalUrl = resolved;
        if (isOversizedAvatar(finalUrl)) {
          finalUrl =
            (await compressDataUrl(finalUrl, {
              maxDim: 128,
              maxChars: API_AVATAR_DATA_URL_MAX - 64,
              force: true,
            })) ?? DEFAULT_AVATAR;
        }
        const saved = await updateUser({ avatar: finalUrl });
        if (!saved) {
          showToast("Profilio nuotrauka neišsaugota.", "error");
          setPreview(null);
          return;
        }
        setPreview(null);
        setCommittedAvatar(finalUrl);
        setCacheBust(Date.now());
        showToast("Profilio nuotrauka atnaujinta.", "success");
      } catch {
        showToast("Nuotraukos įkėlimas nepavyko.", "error");
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [showToast, updateUser]
  );

  const handleSource = useCallback(
    async (source: "camera" | "gallery") => {
      setSheetOpen(false);
      const photo = await capturePhotoFromSource(source);
      if (!photo?.dataUrl) return;
      await uploadAvatar(photo.dataUrl);
    },
    [uploadAvatar]
  );

  const handleRemove = useCallback(async () => {
    const saved = await updateUser({ avatar: DEFAULT_AVATAR });
    if (!saved) {
      showToast("Nepavyko pašalinti nuotraukos.", "error");
      return;
    }
    setPreview(null);
    setCommittedAvatar(DEFAULT_AVATAR);
    setCacheBust(Date.now());
    showToast("Nuotrauka pašalinta.", "info");
  }, [showToast, updateUser]);

  return (
    <>
      <div className="relative shrink-0">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_40%,transparent)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={name}
            className="h-full w-full object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            requestMediaConsent(() => {
              setSheetOpen(true);
            })
          }
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--vauto-accent)] text-white shadow-md ring-2 ring-[var(--vauto-card-bg)] transition hover:brightness-110 disabled:opacity-60"
          aria-label="Keisti profilio nuotrauką"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
        {displaySrc !== DEFAULT_AVATAR && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={uploading}
            className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--vauto-text-main)_12%,transparent)] text-[var(--vauto-text-muted)] shadow-md ring-2 ring-[var(--vauto-card-bg)] hover:text-red-500 disabled:opacity-60"
            aria-label="Pašalinti nuotrauką"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <PhotoSourceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(source) => void handleSource(source)}
      />
    </>
  );
}
