/**
 * Transaction Chat 1.0 — public API (Stage 11C).
 */

export {
  TRANSACTION_CHAT_VERSION,
  type TransactionChatVersion,
} from "./version.js";

export {
  MESSAGE_TYPES,
  DOMAIN_EVENT_TYPES,
  ChatAuthError,
  ChatNotFoundError,
  ChatValidationError,
  type MessageType,
  type DomainEventType,
  type TimelineItem,
  type TimelinePage,
  type TimelineHeader,
  type TransactionMessageRow,
} from "./types.js";

export {
  MAX_MESSAGE_TEXT_LENGTH,
  sanitizeUserText,
  escapeHtml,
  PostMessageBodySchema,
  TimelineQuerySchema,
  ReadReceiptBodySchema,
  TimelineItemSchema,
  MessageTypeSchema,
  DomainEventTypeSchema,
} from "./schema.js";

export {
  offerCreatedEvent,
  offerCounteredEvent,
  offerAcceptedEvent,
  offerRejectedEvent,
  offerWithdrawnEvent,
  offerExpiredEvent,
  transactionStateChangedEvent,
  computeAllowedActions,
  type DomainEventWrite,
} from "./event-adapter.js";

export {
  TransactionChatRepository,
  appendDomainEventOn,
  TRANSACTION_CHAT_MIGRATION_SQL,
  TRANSACTION_CHAT_MIGRATION_ID,
  encodeCursor,
  decodeCursor,
  toTimelineItem,
} from "./repository.js";

export { MessageService } from "./message-service.js";

export {
  TimelineService,
  createTimelineService,
} from "./timeline-service.js";
