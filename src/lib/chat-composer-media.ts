import {
  compressForAiVision,
  pickMultipleFromGallery,
} from "@/lib/native-media";

/** Intake cap: 6 public gallery slots + 1 tech-pasas / registration doc for extraction. */
export const MAX_CHAT_COMPOSER_ATTACHMENTS = 7;

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
