/** System file picker accept — images + common documents (no capture). */
export const CHAT_FILE_ACCEPT =
  "image/*,application/pdf,.pdf,.doc,.docx,.txt,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const MAX_CHAT_COMPOSER_ATTACHMENTS = 15;
export const MAX_CHAT_DOCUMENTS = 5;
export const MAX_DOCUMENT_TEXT_CHARS = 50_000;
export const MAX_DOCUMENT_DATA_URL_CHARS = 8_000_000;

export type ChatComposerImageAttachment = {
  id: string;
  kind: "image";
  url: string;
  fileName?: string;
};

export type ChatComposerDocumentAttachment = {
  id: string;
  kind: "document";
  fileName: string;
  mimeType: string;
  /** Extracted plain text (TXT client-side; PDF/DOCX after server extract). */
  text: string;
  /** Raw file for server-side extraction when text is empty. */
  dataUrl?: string;
};

export type ChatComposerAttachment =
  | ChatComposerImageAttachment
  | ChatComposerDocumentAttachment;

export type PendingChatDocument = {
  fileName: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
};

export function isImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

export function isDocumentFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (
    type === "application/pdf" ||
    type === "text/plain" ||
    type === "application/msword" ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return true;
  }
  return /\.(pdf|txt|docx?)$/i.test(name);
}

export function guessDocumentMimeType(fileName: string, fallback = ""): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (n.endsWith(".doc")) return "application/msword";
  return fallback || "application/octet-stream";
}

export function newAttachmentId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDocumentUploadedBadge(fileName: string): string {
  const name = String(fileName || "dokumentas").trim() || "dokumentas";
  return `📄 Dokumentas įkeltas: ${name}`;
}
