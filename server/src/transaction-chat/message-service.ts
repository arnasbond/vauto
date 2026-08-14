/**
 * User message write path — sanitize only; never mutates transaction state.
 */

import {
  ChatValidationError,
  type TransactionMessageRow,
} from "./types.js";
import {
  PostMessageBodySchema,
  sanitizeUserText,
} from "./schema.js";
import { TransactionChatRepository } from "./repository.js";

export class MessageService {
  constructor(private readonly repo: TransactionChatRepository) {}

  async send(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<{ row: TransactionMessageRow; idempotentReplay: boolean }> {
    let parsed;
    try {
      parsed = PostMessageBodySchema.parse(input.body);
    } catch (e) {
      throw new ChatValidationError(
        e instanceof Error ? e.message : "invalid_message_body"
      );
    }

    let text: string;
    try {
      text = sanitizeUserText(parsed.text);
    } catch {
      throw new ChatValidationError("invalid_text");
    }
    if (!text.trim()) {
      throw new ChatValidationError("empty_text");
    }

    // Attachment IDs are recorded as opaque refs — ownership enforced as "same sender only"
    // (no cross-user attachment injection into another timeline).
    const attachmentIds = (parsed.attachmentIds ?? []).filter(
      (id) => typeof id === "string" && id.length > 0 && !id.includes("..")
    );

    return this.repo.insertUserMessage({
      transactionId: input.transactionId,
      senderId: input.actorUserId,
      text,
      idempotencyKey: parsed.idempotencyKey,
      attachmentIds,
    });
  }
}
