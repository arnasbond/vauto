"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { PhotoSourceSheet } from "@/components/photo/PhotoSourceSheet";
import { useVauto } from "@/context/VautoContext";
import { apiUploadMedia } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import {
  capturePhotoFromSource,
  resolveImageForUpload,
} from "@/lib/native-media";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop";

interface ProfileAvatarEditorProps {
  avatar: string;
  name: string;
}

export function ProfileAvatarEditor({ avatar, name }: ProfileAvatarEditorProps) {
  const { updateUser, requestMediaConsent, showToast } = useVauto();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const displaySrc = preview || avatar || DEFAULT_AVATAR;
  const isDataUrl = displaySrc.startsWith("data:");

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
        if (isDataApiEnabled()) {
          const uploaded = await apiUploadMedia(resolved);
          if (uploaded) finalUrl = uploaded;
        }

        updateUser({ avatar: finalUrl });
        setPreview(finalUrl);
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

  const handleRemove = useCallback(() => {
    updateUser({ avatar: DEFAULT_AVATAR });
    setPreview(DEFAULT_AVATAR);
    showToast("Nuotrauka pašalinta.", "info");
  }, [showToast, updateUser]);

  return (
    <>
      <div className="relative shrink-0">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_40%,transparent)]">
          {isDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displaySrc}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Image
              src={displaySrc}
              alt={name}
              width={64}
              height={64}
              className="h-16 w-16 object-cover"
              unoptimized={displaySrc.startsWith("blob:")}
            />
          )}
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
            onClick={handleRemove}
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
