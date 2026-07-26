import { capturePhoto, type PhotoPickSource } from "@/lib/native-media";
import { compressForAgentVisionSmart } from "@/lib/prepare-chat-images-for-agent";
import {
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  newAttachmentId,
  type ChatComposerAttachment,
} from "@/lib/chat-attachment-types";
import { pickChatComposerAttachments } from "@/lib/chat-document-extract";

export { MAX_CHAT_COMPOSER_ATTACHMENTS };
export type { ChatComposerAttachment };

export type ChatMediaPickSource = "camera" | "gallery";

/**
 * Opens native camera or system file picker.
 * - camera → capture / Capacitor Camera (Fotografuoti) — images only
 * - gallery → system file manager (images + PDF/DOC/TXT), no capture
 */
export async function pickNativeChatMedia(
  currentCount: number,
  source: ChatMediaPickSource = "gallery"
): Promise<ChatComposerAttachment[]> {
  const remaining = MAX_CHAT_COMPOSER_ATTACHMENTS - currentCount;
  if (remaining <= 0) return [];

  if (source === "gallery") {
    return pickChatComposerAttachments(
      currentCount,
      MAX_CHAT_COMPOSER_ATTACHMENTS
    );
  }

  const photo = await capturePhoto("camera" satisfies PhotoPickSource);
  if (!photo?.dataUrl) return [];

  let url = photo.dataUrl;
  try {
    url = await compressForAgentVisionSmart(photo.dataUrl);
  } catch {
    url = photo.dataUrl;
  }

  return [
    {
      id: newAttachmentId(),
      kind: "image",
      url,
      fileName: photo.fileName,
    },
  ];
}
