-- Stage 11B — Structured Offers 1.0 (server-authoritative).
-- Integer cents only. No Stripe / escrow / UI chat in this migration.

-- Single-sale guard: at most one "won" transaction per listing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_transactions_listing_active_sale
  ON vauto_transactions (listing_id)
  WHERE status IN (
    'AGREED', 'PAYMENT_PENDING', 'PAID', 'SHIPPING_PENDING',
    'SHIPPED', 'DELIVERED', 'COMPLETED'
  );

CREATE TABLE IF NOT EXISTS vauto_offers (
  id                   TEXT PRIMARY KEY,
  transaction_id       TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE CASCADE,
  listing_id           TEXT NOT NULL,
  buyer_id             TEXT NOT NULL,
  seller_id            TEXT NOT NULL,
  created_by_user_id   TEXT NOT NULL,
  parent_offer_id      TEXT NULL REFERENCES vauto_offers (id) ON DELETE SET NULL,
  amount_cents         INTEGER NOT NULL CHECK (amount_cents > 0),
  currency             TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  status               TEXT NOT NULL
    CHECK (status IN (
      'PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'WITHDRAWN', 'EXPIRED'
    )),
  version              INTEGER NOT NULL DEFAULT 0,
  idempotency_key      TEXT NOT NULL,
  expires_at           TIMESTAMPTZ NULL,
  offers_version       TEXT NOT NULL DEFAULT '1.0',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vauto_offers_buyer_seller_diff CHECK (buyer_id <> seller_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_offers_idempotency
  ON vauto_offers (transaction_id, idempotency_key);

-- At most one PENDING offer tip per transaction (active negotiation branch).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_offers_active_pending_per_tx
  ON vauto_offers (transaction_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_vauto_offers_listing_status
  ON vauto_offers (listing_id, status);

CREATE INDEX IF NOT EXISTS idx_vauto_offers_tx_created
  ON vauto_offers (transaction_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vauto_offers_parent
  ON vauto_offers (parent_offer_id);
