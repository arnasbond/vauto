import {
  compressForAiVision,
  pickMultipleFromGallery,
} from "@/lib/native-media";

export const MAX_CHAT_COMPOSER_ATTACHMENTS = 6;

/** Opens the OS/browser native media picker — no custom Fotografuoti/Galerija sheet. */
export async function pickNativeChatMedia(
  currentCount: number
): Promise<string[]> {
  const remaining = MAX_CHAT_COMPOSER_ATTACHMENTS - currentCount;
  if (remaining <= 0) return [];

  const photos = await pickMultipleFromGallery(remaining);
  if (!photos.length) return [];

  const compressed = await Promise.all(
    photos.map((photo) => compressForAiVision(photo.dataUrl))
  );
  return compressed.filter(Boolean);
}
