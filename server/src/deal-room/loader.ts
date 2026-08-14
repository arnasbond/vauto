/**
 * Deal Room loader — aggregates 11A–11D into a read-only snapshot.
 */

import type { TxQueryable } from "../transaction/repository.js";
import { TransactionRepository } from "../transaction/repository.js";
import { OfferRepository } from "../transaction/offers/repository.js";
import { resolveActorRole } from "../transaction/offers/offer-validator.js";
import { sanitizeUserText, escapeHtml } from "../transaction-chat/schema.js";
import { computeDealRoomAllowedActions } from "./allowed-actions.js";
import { adaptTimelinePreview } from "./timeline-adapter.js";
import { getAgreementSnapshotByTransaction } from "./snapshot-writer.js";
import { DealRoomResponseSchema } from "./schema.js";
import {
  DealRoomAuthError,
  DealRoomNotFoundError,
  DealRoomVersionConflictError,
  type DealRoomResponse,
  type ParticipantSummary,
} from "./types.js";
import { DEAL_ROOM_VERSION } from "./version.js";

export type ParticipantPort = {
  loadParticipant: (userId: string) => Promise<{
    displayName: string;
    avatarUrl: string | null;
    verified: boolean;
  } | null>;
};

export type ListingPort = {
  loadListing: (listingId: string) => Promise<{
    title: string;
    thumbnail: string | null;
    askingPriceCents: number | null;
  } | null>;
};

const defaultParticipantPort: ParticipantPort = {
  async loadParticipant(userId) {
    return {
      displayName: `Narys ${userId.slice(0, 8)}`,
      avatarUrl: null,
      verified: false,
    };
  },
};

async function loadListingViaDb(
  db: TxQueryable,
  listingId: string
): Promise<{
  title: string;
  thumbnail: string | null;
  askingPriceCents: number | null;
} | null> {
  try {
    await db.query(`SAVEPOINT deal_room_listing`);
  } catch {
    return null;
  }
  try {
    const rows = await db.query<{
      title: string | null;
      price: number | string | null;
      image: string | null;
      images: unknown;
      status: string | null;
    }>(
      `SELECT title, price, image, images, status FROM listings WHERE id = $1 LIMIT 1`,
      [listingId]
    );
    await db.query(`RELEASE SAVEPOINT deal_room_listing`);
    const r = rows.rows[0];
    if (!r) return null;
    let thumb = r.image ?? null;
    if (!thumb && Array.isArray(r.images) && r.images[0]) {
      thumb = String(r.images[0]);
    }
    const priceNum =
      r.price == null ? null : Math.round(Number(r.price) * 100);
    return {
      title: String(r.title ?? listingId),
      thumbnail: thumb,
      askingPriceCents:
        priceNum != null && Number.isFinite(priceNum) && priceNum > 0
          ? priceNum
          : null,
    };
  } catch {
    try {
      await db.query(`ROLLBACK TO SAVEPOINT deal_room_listing`);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export class DealRoomLoader {
  private readonly txRepo: TransactionRepository;
  private readonly offerRepo: OfferRepository;

  constructor(
    private readonly db: TxQueryable,
    private readonly ports: {
      participants?: ParticipantPort;
      listing?: ListingPort;
    } = {}
  ) {
    this.txRepo = new TransactionRepository(db);
    this.offerRepo = new OfferRepository(db);
  }

  async load(input: {
    transactionId: string;
    actorUserId: string;
    expectedTransactionVersion?: number;
    expectedActiveOfferVersion?: number | null;
    timelineLimit?: number;
  }): Promise<DealRoomResponse> {
    const tx = await this.txRepo.getById(input.transactionId);
    if (!tx) {
      // IDOR: same 404 for missing and non-participant
      throw new DealRoomNotFoundError(input.transactionId);
    }

    let viewerRole: "BUYER" | "SELLER";
    try {
      viewerRole = resolveActorRole(input.actorUserId, tx);
    } catch {
      throw new DealRoomAuthError();
    }

    if (
      input.expectedTransactionVersion != null &&
      input.expectedTransactionVersion !== tx.version
    ) {
      throw new DealRoomVersionConflictError(
        `Stale transactionVersion: expected ${input.expectedTransactionVersion}, got ${tx.version}`
      );
    }

    const offers = await this.offerRepo.listOffersForTransaction(
      tx.id,
      input.actorUserId
    );
    const pending = [...offers].reverse().find((o) => o.status === "PENDING");
    const accepted = [...offers].reverse().find((o) => o.status === "ACCEPTED");

    if (input.expectedActiveOfferVersion !== undefined) {
      if (input.expectedActiveOfferVersion === null) {
        if (pending) {
          throw new DealRoomVersionConflictError(
            "Stale activeOfferVersion: expected null"
          );
        }
      } else if (
        !pending ||
        pending.version !== input.expectedActiveOfferVersion
      ) {
        throw new DealRoomVersionConflictError(
          `Stale activeOfferVersion: expected ${input.expectedActiveOfferVersion}, got ${pending?.version ?? "none"}`
        );
      }
    }

    const participantPort =
      this.ports.participants ?? defaultParticipantPort;
    const [buyerInfo, sellerInfo] = await Promise.all([
      participantPort.loadParticipant(tx.buyerId),
      participantPort.loadParticipant(tx.sellerId),
    ]);

    const buyer: ParticipantSummary = {
      userId: tx.buyerId,
      role: "BUYER",
      displayName: buyerInfo?.displayName ?? `Pirkėjas`,
      avatarUrl: buyerInfo?.avatarUrl ?? null,
      verified: buyerInfo?.verified ?? false,
    };
    const seller: ParticipantSummary = {
      userId: tx.sellerId,
      role: "SELLER",
      displayName: sellerInfo?.displayName ?? `Pardavėjas`,
      avatarUrl: sellerInfo?.avatarUrl ?? null,
      verified: sellerInfo?.verified ?? false,
    };

    // Never expose email/phone in response construction
    const piiLeak = (s: string) => /@|phone|tel\.|email/i.test(s);
    if (piiLeak(buyer.displayName)) buyer.displayName = "Pirkėjas";
    if (piiLeak(seller.displayName)) seller.displayName = "Pardavėjas";

    let listingLive = this.ports.listing
      ? await this.ports.listing.loadListing(tx.listingId)
      : await loadListingViaDb(this.db, tx.listingId);

    const askingFromTx =
      tx.currentPrice != null && Number.isFinite(tx.currentPrice)
        ? Math.max(1, Math.round(tx.currentPrice * 100))
        : null;

    const listing = {
      id: tx.listingId,
      title: listingLive?.title ?? tx.listingId,
      thumbnail: listingLive?.thumbnail ?? null,
      askingPriceCents: listingLive?.askingPriceCents ?? askingFromTx,
      currency: "EUR" as const,
    };

    const activeOffer = pending
      ? {
          id: pending.id,
          amountCents: pending.amountCents,
          createdByRole:
            pending.createdByUserId === tx.buyerId
              ? ("BUYER" as const)
              : ("SELLER" as const),
          status: pending.status,
          expiresAt: pending.expiresAt,
          version: pending.version,
        }
      : null;

    const snapRow = await getAgreementSnapshotByTransaction(this.db, tx.id);

    const agreementSnapshot = snapRow
      ? {
          id: snapRow.id,
          acceptedOfferId: snapRow.acceptedOfferId,
          amountCents: snapRow.amountCents,
          currency: "EUR" as const,
          listingTitle: snapRow.listingTitle,
          listingAttributes: snapRow.listingAttributesJson,
          listingPrimaryImage: snapRow.listingPrimaryImage,
          snapshotHash: snapRow.snapshotHash,
          createdAt: snapRow.createdAt,
        }
      : null;

    const allowedActions = computeDealRoomAllowedActions({
      viewerRole,
      transactionStatus: tx.status,
      activeOffer,
    });

    const chatRows = await this.db.query<{
      id: string;
      message_type: string;
      event_type: string | null;
      sender_id: string | null;
      text: string;
      created_at: string;
    }>(
      `SELECT id, message_type, event_type, sender_id, text, created_at
       FROM vauto_transaction_messages
       WHERE transaction_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [tx.id]
    ).catch(() => ({ rows: [] as never[] }));

    const timelinePreview = adaptTimelinePreview(
      chatRows.rows
        .slice()
        .reverse()
        .map((r) => ({
          id: r.id,
          messageType: r.message_type,
          eventType: r.event_type,
          senderId: r.sender_id,
          textSafe: escapeHtml(sanitizeUserText(r.text || " ")),
          createdAt: String(r.created_at),
        })),
      input.timelineLimit ?? 15
    );

    void accepted; // reserved for diagnostics

    const response: DealRoomResponse = {
      dealRoomVersion: DEAL_ROOM_VERSION,
      transaction: {
        id: tx.id,
        state: tx.status,
        version: tx.version,
      },
      listing,
      buyer,
      seller,
      activeOffer,
      agreementSnapshot,
      transactionSummary: {
        paymentStatus: "NOT_AVAILABLE",
        shippingStatus: "NOT_AVAILABLE",
        protectionStatus: "NOT_AVAILABLE",
      },
      allowedActions,
      timelinePreview,
      transactionVersion: tx.version,
      activeOfferVersion: pending?.version ?? null,
      viewerRole,
    };

    return DealRoomResponseSchema.parse(response);
  }
}
