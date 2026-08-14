-- Stage 11C — Transaction Chat 1.0 (context-bound unified timeline).
-- Chat is NOT authoritative for transaction / offer / payment state.

CREATE TABLE IF NOT EXISTS vauto_transaction_messages (
  id               TEXT PRIMARY KEY,
  transaction_id   TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE CASCADE,
  sender_id        TEXT NULL,
  message_type     TEXT NOT NULL
    CHECK (message_type IN ('USER_MESSAGE', 'DOMAIN_EVENT')),
  event_type       TEXT NULL,
  text             TEXT NOT NULL DEFAULT '',
  payload_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key  TEXT NULL,
  deleted_at       TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chat_version     TEXT NOT NULL DEFAULT '1.0',
  CONSTRAINT vauto_tx_messages_user_requires_idempotency CHECK (
    message_type <> 'USER_MESSAGE'
    OR (sender_id IS NOT NULL AND idempotency_key IS NOT NULL)
  ),
  CONSTRAINT vauto_tx_messages_domain_requires_event CHECK (
    message_type <> 'DOMAIN_EVENT'
    OR (event_type IS NOT NULL AND sender_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_vauto_tx_messages_timeline
  ON vauto_transaction_messages (transaction_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

-- User message idempotency (sender_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_tx_messages_user_idempotency
  ON vauto_transaction_messages (transaction_id, sender_id, idempotency_key)
  WHERE sender_id IS NOT NULL AND idempotency_key IS NOT NULL;

-- Domain event idempotency (system)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vauto_tx_messages_domain_idempotency
  ON vauto_transaction_messages (transaction_id, idempotency_key)
  WHERE sender_id IS NULL AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS vauto_transaction_reads (
  transaction_id       TEXT NOT NULL REFERENCES vauto_transactions (id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL,
  last_read_message_id TEXT NULL REFERENCES vauto_transaction_messages (id) ON DELETE SET NULL,
  last_read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, user_id)
);
