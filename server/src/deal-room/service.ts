/**
 * Deal Room service façade.
 */

import type { TxQueryable } from "../transaction/repository.js";
import {
  DealRoomLoader,
  type ListingPort,
  type ParticipantPort,
} from "./loader.js";
import { DealRoomQuerySchema } from "./schema.js";
import {
  DealRoomValidationError,
  type DealRoomResponse,
} from "./types.js";

export class DealRoomService {
  private readonly loader: DealRoomLoader;

  constructor(
    db: TxQueryable,
    ports?: { participants?: ParticipantPort; listing?: ListingPort }
  ) {
    this.loader = new DealRoomLoader(db, ports);
  }

  async getDealRoom(input: {
    transactionId: string;
    actorUserId: string;
    query?: unknown;
  }): Promise<DealRoomResponse> {
    let parsed;
    try {
      parsed = DealRoomQuerySchema.parse(input.query ?? {});
    } catch (e) {
      throw new DealRoomValidationError(
        e instanceof Error ? e.message : "invalid_query"
      );
    }
    return this.loader.load({
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      expectedTransactionVersion: parsed.expectedTransactionVersion,
      expectedActiveOfferVersion: parsed.expectedActiveOfferVersion,
      timelineLimit: parsed.timelineLimit,
    });
  }
}

export function createDealRoomService(
  db: TxQueryable,
  ports?: { participants?: ParticipantPort; listing?: ListingPort }
): DealRoomService {
  return new DealRoomService(db, ports);
}
