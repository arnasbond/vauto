/**
 * Transaction Chat 1.0 — Zod schemas + sanitization helpers.
 */

import { z } from "zod";
import { TRANSACTION_CHAT_VERSION } from "./version.js";
import { DOMAIN_EVENT_TYPES, MESSAGE_TYPES } from "./types.js";

export const MAX_MESSAGE_TEXT_LENGTH = 4000;

export const MessageTypeSchema = z.enum(MESSAGE_TYPES);
export const DomainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);

/** Strip control chars (keep \n \t), enforce UTF-8 length. */
export function sanitizeUserText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("text_must_be_string");
  }
  // Remove C0 controls except tab/newline; remove DEL
  let s = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.normalize("NFC");
  if (s.length > MAX_MESSAGE_TEXT_LENGTH) {
    s = s.slice(0, MAX_MESSAGE_TEXT_LENGTH);
  }
  return s;
}

/** XSS presentation escape — never treat user text as HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const PostMessageBodySchema = z
  .object({
    text: z.string().min(1).max(MAX_MESSAGE_TEXT_LENGTH),
    idempotencyKey: z.string().min(8).max(200),
    attachmentIds: z.array(z.string().min(1).max(128)).max(8).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const forbidden = [
      "messageType",
      "eventType",
      "senderId",
      "createdAt",
      "transactionState",
      "status",
      "domainEvent",
    ] as const;
    for (const k of forbidden) {
      if (k in (body as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `client_${k}_forbidden`,
        });
      }
    }
  });

export const TimelineQuerySchema = z
  .object({
    before: z.string().min(1).max(500).optional(),
    limit: z.preprocess((v) => {
      if (v === undefined || v === null || v === "") return 30;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return 30;
      return Math.min(50, Math.max(1, Math.trunc(n)));
    }, z.number().int().min(1).max(50)),
  })
  .strict();

export const ReadReceiptBodySchema = z
  .object({
    lastReadMessageId: z.string().min(1).max(128),
  })
  .strict();

export const TimelineItemSchema = z
  .object({
    id: z.string(),
    transactionId: z.string(),
    messageType: MessageTypeSchema,
    eventType: DomainEventTypeSchema.nullable(),
    senderId: z.string().nullable(),
    text: z.string(),
    textSafe: z.string(),
    payload: z.record(z.unknown()),
    createdAt: z.string(),
    chatVersion: z.literal(TRANSACTION_CHAT_VERSION),
  })
  .strict();

export type PostMessageBodyParsed = z.infer<typeof PostMessageBodySchema>;
export type TimelineQueryParsed = z.infer<typeof TimelineQuerySchema>;
