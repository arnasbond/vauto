/**
 * Immutable agreement snapshot writer — called inside 11B accept TX when AGREED.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TxQueryable } from "../transaction/repository.js";
import type { VautoTransaction } from "../transaction/types.js";
import type { VautoOffer } from "../transaction/offers/types.js";
import type { DealSnapshotRow } from "./types.js";
import { DEAL_ROOM_VERSION } from "./version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEAL_ROOM_MIGRATION_ID = "042_deal_room_snapshots_1.0";
export const DEAL_ROOM_MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../migrations/042_deal_room_snapshots_1.0.sql"),
  "utf8"
);

export type ListingFreeze = {
  title: string;
  attributes: Record<string, unknown>;
  primaryImage: string | null;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function computeSnapshotHash(input: {
  transactionId: string;
  acceptedOfferId: string;
  amountCents: number;
  listingId: string;
  listingTitle: string;
  listingAttributes: Record<string, unknown>;
  listingPrimaryImage: string | null;
  buyerId: string;
  sellerId: string;
}): string {
  const canonical = stableStringify({
    transactionId: input.transactionId,
    acceptedOfferId: input.acceptedOfferId,
    amountCents: input.amountCents,
    currency: "EUR",
    listingId: input.listingId,
    listingTitle: input.listingTitle,
    listingAttributes: input.listingAttributes,
    listingPrimaryImage: input.listingPrimaryImage,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
    dealRoomVersion: DEAL_ROOM_VERSION,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function loadListingFreeze(
  db: TxQueryable,
  listingId: string
): Promise<ListingFreeze> {
  // M-01 fail-closed: missing listing facts MUST abort the outer AGREED TX.
  let rows;
  try {
    rows = await db.query<{
      title: string | null;
      image: string | null;
      images: unknown;
      attributes: unknown;
    }>(
      `SELECT title, image, images, attributes FROM listings WHERE id = $1 LIMIT 1`,
      [listingId]
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Agreement snapshot fail-closed: cannot load listing ${listingId}: ${msg}`
    );
  }
  const r = rows.rows[0];
  if (!r) {
    throw new Error(
      `Agreement snapshot fail-closed: listing not found: ${listingId}`
    );
  }
  const title = String(r.title ?? "").trim();
  if (!title) {
    throw new Error(
      `Agreement snapshot fail-closed: listing title missing: ${listingId}`
    );
  }
  let primary: string | null = r.image ?? null;
  if (!primary && Array.isArray(r.images) && r.images[0]) {
    primary = String(r.images[0]);
  }
  if (r.attributes != null && typeof r.attributes !== "object") {
    throw new Error(
      `Agreement snapshot fail-closed: listing attributes invalid: ${listingId}`
    );
  }
  const attrs =
    r.attributes && typeof r.attributes === "object" && !Array.isArray(r.attributes)
      ? (r.attributes as Record<string, unknown>)
      : {};
  return {
    title: title.slice(0, 500),
    attributes: attrs,
    primaryImage: primary,
  };
}

function mapSnapshot(r: Record<string, unknown>): DealSnapshotRow {
  const attrs = r.listing_attributes_json;
  return {
    id: String(r.id),
    transactionId: String(r.transaction_id),
    acceptedOfferId: String(r.accepted_offer_id),
    amountCents: Number(r.amount_cents),
    currency: "EUR",
    listingId: String(r.listing_id),
    listingTitle: String(r.listing_title),
    listingAttributesJson:
      attrs && typeof attrs === "object" && !Array.isArray(attrs)
        ? (attrs as Record<string, unknown>)
        : {},
    listingPrimaryImage:
      r.listing_primary_image == null
        ? null
        : String(r.listing_primary_image),
    buyerId: String(r.buyer_id),
    sellerId: String(r.seller_id),
    snapshotHash: String(r.snapshot_hash),
    createdAt: String(r.created_at),
  };
}

/** Idempotent insert — unique(transaction_id) protects replays. */
export async function ensureAgreementSnapshot(
  db: TxQueryable,
  input: {
    transaction: VautoTransaction;
    acceptedOffer: VautoOffer;
    listingFreeze?: ListingFreeze;
  }
): Promise<DealSnapshotRow> {
  const existing = await db.query<Record<string, unknown>>(
    `SELECT * FROM vauto_deal_snapshots WHERE transaction_id = $1 LIMIT 1`,
    [input.transaction.id]
  );
  if (existing.rows[0]) return mapSnapshot(existing.rows[0]);

  const freeze =
    input.listingFreeze ??
    (await loadListingFreeze(db, input.transaction.listingId));

  if (!freeze.title?.trim()) {
    throw new Error(
      "Agreement snapshot fail-closed: listing title required"
    );
  }

  const amountCents = input.acceptedOffer.amountCents;
  const hash = computeSnapshotHash({
    transactionId: input.transaction.id,
    acceptedOfferId: input.acceptedOffer.id,
    amountCents,
    listingId: input.transaction.listingId,
    listingTitle: freeze.title,
    listingAttributes: freeze.attributes,
    listingPrimaryImage: freeze.primaryImage,
    buyerId: input.transaction.buyerId,
    sellerId: input.transaction.sellerId,
  });

  const id = randomUUID();
  const inserted = await db.query<Record<string, unknown>>(
    `INSERT INTO vauto_deal_snapshots (
       id, transaction_id, accepted_offer_id, amount_cents, currency,
       listing_id, listing_title, listing_attributes_json, listing_primary_image,
       buyer_id, seller_id, snapshot_hash, deal_room_version
     ) VALUES (
       $1,$2,$3,$4,'EUR',$5,$6,$7::jsonb,$8,$9,$10,$11,$12
     )
     ON CONFLICT (transaction_id) DO NOTHING
     RETURNING *`,
    [
      id,
      input.transaction.id,
      input.acceptedOffer.id,
      amountCents,
      input.transaction.listingId,
      freeze.title,
      JSON.stringify(freeze.attributes ?? {}),
      freeze.primaryImage,
      input.transaction.buyerId,
      input.transaction.sellerId,
      hash,
      DEAL_ROOM_VERSION,
    ]
  );
  if (inserted.rows[0]) return mapSnapshot(inserted.rows[0]);

  const again = await db.query<Record<string, unknown>>(
    `SELECT * FROM vauto_deal_snapshots WHERE transaction_id = $1 LIMIT 1`,
    [input.transaction.id]
  );
  if (!again.rows[0]) {
    throw new Error("Failed to persist agreement snapshot");
  }
  return mapSnapshot(again.rows[0]);
}

export async function getAgreementSnapshotByTransaction(
  db: TxQueryable,
  transactionId: string
): Promise<DealSnapshotRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM vauto_deal_snapshots WHERE transaction_id = $1 LIMIT 1`,
    [transactionId]
  );
  return rows.rows[0] ? mapSnapshot(rows.rows[0]) : null;
}
