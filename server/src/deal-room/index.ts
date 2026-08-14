/**
 * Deal Room 1.0 — public exports.
 */

export { DEAL_ROOM_VERSION, type DealRoomVersion } from "./version.js";

export {
  DEAL_ROOM_ALLOWED_ACTIONS,
  DealRoomAuthError,
  DealRoomNotFoundError,
  DealRoomVersionConflictError,
  DealRoomValidationError,
  type DealRoomAllowedAction,
  type DealRoomResponse,
  type DealSnapshotRow,
  type ParticipantSummary,
} from "./types.js";

export {
  DealRoomQuerySchema,
  DealRoomResponseSchema,
} from "./schema.js";

export { computeDealRoomAllowedActions } from "./allowed-actions.js";
export { adaptTimelinePreview } from "./timeline-adapter.js";

export {
  DEAL_ROOM_MIGRATION_SQL,
  DEAL_ROOM_MIGRATION_ID,
  ensureAgreementSnapshot,
  getAgreementSnapshotByTransaction,
  computeSnapshotHash,
} from "./snapshot-writer.js";

export {
  DealRoomLoader,
  type ParticipantPort,
  type ListingPort,
} from "./loader.js";

export { DealRoomService, createDealRoomService } from "./service.js";
