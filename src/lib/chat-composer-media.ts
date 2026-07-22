import { pickMultipleFromGallery } from "@/lib/native-media";
import { compressForAgentVisionSmart } from "@/lib/prepare-chat-images-for-agent";

export const MAX_CHAT_COMPOSER_ATTACHMENTS = 6;

/** Opens the OS/browser native media picker — no custom Fotografuoti/Galerija sheet. */
export async function pickNativeChatMedia(
  currentCount: number
): Promise<string[]> {
  const remaining = MAX_CHAT_COMPOSER_ATTACHMENTS - currentCount;
  if (remaining <= 0) return [];

  const photos = await pickMultipleFromGallery(remaining);
  if (!photos.length) return [];

  // Sequential canvas work — avoids RAM spikes with 6 large phone photos.
  const compressed: string[] = [];
  for (const photo of photos) {
    try {
      compressed.push(await compressForAgentVisionSmart(photo.dataUrl));
    } catch {
      compressed.push(photo.dataUrl);
    }
  }
  return compressed.filter(Boolean);
}
