import {
  CHAT_FILE_ACCEPT,
  guessDocumentMimeType,
  isDocumentFile,
  isImageFile,
  MAX_DOCUMENT_DATA_URL_CHARS,
  MAX_DOCUMENT_TEXT_CHARS,
  newAttachmentId,
  type ChatComposerAttachment,
  type PendingChatDocument,
} from "@/lib/chat-attachment-types";
import { compressForAgentVisionSmart } from "@/lib/prepare-chat-images-for-agent";
import { pickMultipleChatFiles } from "@/lib/native-media";

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function fileToComposerAttachment(
  file: File
): Promise<ChatComposerAttachment | null> {
  if (isImageFile(file)) {
    const dataUrl = await blobToDataUrl(file);
    if (!dataUrl?.startsWith("data:image")) return null;
    let url = dataUrl;
    try {
      url = await compressForAgentVisionSmart(dataUrl);
    } catch {
      url = dataUrl;
    }
    return {
      id: newAttachmentId(),
      kind: "image",
      url,
      fileName: file.name,
    };
  }

  if (!isDocumentFile(file)) return null;

  const mimeType = guessDocumentMimeType(file.name, file.type);
  const lower = file.name.toLowerCase();

  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    const raw = await file.text();
    const text = raw.replace(/\u0000/g, "").trim().slice(0, MAX_DOCUMENT_TEXT_CHARS);
    if (!text) return null;
    return {
      id: newAttachmentId(),
      kind: "document",
      fileName: file.name,
      mimeType: "text/plain",
      text,
    };
  }

  const dataUrl = await blobToDataUrl(file);
  if (!dataUrl || dataUrl.length > MAX_DOCUMENT_DATA_URL_CHARS) return null;

  return {
    id: newAttachmentId(),
    kind: "document",
    fileName: file.name,
    mimeType,
    text: "",
    dataUrl,
  };
}

/** Open system file picker (images + documents). Never sets capture. */
export async function pickChatComposerAttachments(
  currentCount: number,
  maxCount: number
): Promise<ChatComposerAttachment[]> {
  const remaining = maxCount - currentCount;
  if (remaining <= 0) return [];

  const files = await pickMultipleChatFiles(remaining, CHAT_FILE_ACCEPT);
  if (!files.length) return [];

  const out: ChatComposerAttachment[] = [];
  for (const file of files.slice(0, remaining)) {
    try {
      const att = await fileToComposerAttachment(file);
      if (att) out.push(att);
    } catch {
      /* skip unreadable file */
    }
  }
  return out;
}

export function splitComposerAttachments(items: ChatComposerAttachment[]): {
  imageUrls: string[];
  documents: PendingChatDocument[];
  documentBadges: { fileName: string }[];
} {
  const imageUrls: string[] = [];
  const documents: PendingChatDocument[] = [];
  const documentBadges: { fileName: string }[] = [];

  for (const item of items) {
    if (item.kind === "image") {
      imageUrls.push(item.url);
      continue;
    }
    documentBadges.push({ fileName: item.fileName });
    documents.push({
      fileName: item.fileName,
      mimeType: item.mimeType,
      ...(item.text ? { text: item.text.slice(0, MAX_DOCUMENT_TEXT_CHARS) } : {}),
      ...(item.dataUrl && item.dataUrl.length <= MAX_DOCUMENT_DATA_URL_CHARS
        ? { dataUrl: item.dataUrl }
        : {}),
    });
  }

  return { imageUrls, documents, documentBadges };
}
