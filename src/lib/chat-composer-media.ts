import {
  capturePhoto,
  pickMultipleFromGallery,
  type PhotoPickSource,
} from "@/lib/native-media";
import { compressForAgentVisionSmart } from "@/lib/prepare-chat-images-for-agent";

export const MAX_CHAT_COMPOSER_ATTACHMENTS = 10;

export type ChatMediaPickSource = "camera" | "gallery";

/**
 * Opens native camera or gallery.
 * - camera → capture="environment" / Capacitor Camera (Fotografuoti)
 * - gallery → multi-select image/* without capture (Nuotraukų galerija)
 */
export async function pickNativeChatMedia(
  currentCount: number,
  source: ChatMediaPickSource = "gallery"
): Promise<string[]> {
  const remaining = MAX_CHAT_COMPOSER_ATTACHMENTS - currentCount;
  if (remaining <= 0) return [];

  const rawUrls: string[] = [];

  if (source === "camera") {
    const photo = await capturePhoto("camera" satisfies PhotoPickSource);
    if (photo?.dataUrl) rawUrls.push(photo.dataUrl);
  } else {
    const photos = await pickMultipleFromGallery(remaining);
    for (const photo of photos) {
      if (photo.dataUrl) rawUrls.push(photo.dataUrl);
    }
  }

  if (!rawUrls.length) return [];

  // Sequential canvas work — avoids RAM spikes with many large phone photos.
  const compressed: string[] = [];
  for (const url of rawUrls) {
    try {
      compressed.push(await compressForAgentVisionSmart(url));
    } catch {
      compressed.push(url);
    }
  }
  return compressed.filter(Boolean);
}
