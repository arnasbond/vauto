/**
 * Unified timeline — USER_MESSAGE + DOMAIN_EVENT, never authoritative for state.
 */

import type { TxQueryable } from "../transaction/repository.js";
import { TransactionRepository } from "../transaction/repository.js";
import {
  TransactionChatRepository,
  toTimelineItem,
} from "./repository.js";
import { MessageService } from "./message-service.js";
import { computeAllowedActions } from "./event-adapter.js";
import {
  TimelineQuerySchema,
  ReadReceiptBodySchema,
} from "./schema.js";
import {
  ChatValidationError,
  type TimelinePage,
} from "./types.js";
import { TRANSACTION_CHAT_VERSION } from "./version.js";

export class TimelineService {
  private readonly chatRepo: TransactionChatRepository;
  private readonly txRepo: TransactionRepository;
  private readonly messages: MessageService;

  constructor(db: TxQueryable) {
    this.chatRepo = new TransactionChatRepository(db);
    this.txRepo = new TransactionRepository(db);
    this.messages = new MessageService(this.chatRepo);
  }

  async getTimeline(input: {
    transactionId: string;
    userId: string;
    query: unknown;
  }): Promise<TimelinePage> {
    let q;
    try {
      q = TimelineQuerySchema.parse(input.query ?? {});
    } catch (e) {
      throw new ChatValidationError(
        e instanceof Error ? e.message : "invalid_query"
      );
    }
    const tx = await this.chatRepo.assertParticipant(
      input.transactionId,
      input.userId
    );
    const page = await this.chatRepo.listTimeline({
      transactionId: input.transactionId,
      userId: input.userId,
      before: q.before,
      limit: q.limit,
    });
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      header: {
        transactionId: tx.id,
        listingId: tx.listingId,
        transactionState: tx.status,
        transactionVersion: tx.version,
        buyerId: tx.buyerId,
        sellerId: tx.sellerId,
        allowedActions: computeAllowedActions({
          userId: input.userId,
          buyerId: tx.buyerId,
          sellerId: tx.sellerId,
          status: tx.status,
        }),
      },
      chatVersion: TRANSACTION_CHAT_VERSION,
    };
  }

  async postMessage(input: {
    transactionId: string;
    userId: string;
    body: unknown;
  }): Promise<{
    item: ReturnType<typeof toTimelineItem>;
    idempotentReplay: boolean;
    chatVersion: typeof TRANSACTION_CHAT_VERSION;
  }> {
    const before = await this.txRepo.getById(input.transactionId);
    const result = await this.messages.send({
      transactionId: input.transactionId,
      actorUserId: input.userId,
      body: input.body,
    });
    const after = await this.txRepo.getById(input.transactionId);
    if (
      before &&
      after &&
      (before.status !== after.status || before.version !== after.version)
    ) {
      throw new Error("invariant_chat_mutated_transaction_state");
    }
    return {
      item: toTimelineItem(result.row),
      idempotentReplay: result.idempotentReplay,
      chatVersion: TRANSACTION_CHAT_VERSION,
    };
  }

  async markRead(input: {
    transactionId: string;
    userId: string;
    body: unknown;
  }): Promise<{ ok: true; chatVersion: typeof TRANSACTION_CHAT_VERSION }> {
    let parsed;
    try {
      parsed = ReadReceiptBodySchema.parse(input.body);
    } catch (e) {
      throw new ChatValidationError(
        e instanceof Error ? e.message : "invalid_read_body"
      );
    }
    await this.chatRepo.markRead({
      transactionId: input.transactionId,
      userId: input.userId,
      lastReadMessageId: parsed.lastReadMessageId,
    });
    return { ok: true, chatVersion: TRANSACTION_CHAT_VERSION };
  }

  get repository(): TransactionChatRepository {
    return this.chatRepo;
  }
}

export function createTimelineService(db: TxQueryable): TimelineService {
  return new TimelineService(db);
}
