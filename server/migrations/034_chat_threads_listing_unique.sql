-- Listing-bound chats: one thread per (buyer, seller, listing).
-- Collapse legacy duplicates before enforcing uniqueness.

DO $$
DECLARE
  grp RECORD;
  keep_id TEXT;
  drop_id TEXT;
  ids TEXT[];
BEGIN
  FOR grp IN
    SELECT
      buyer_id,
      seller_id,
      listing_id,
      ARRAY_AGG(id ORDER BY updated_at DESC NULLS LAST, id DESC) AS all_ids
    FROM chat_threads
    GROUP BY buyer_id, seller_id, listing_id
    HAVING COUNT(*) > 1
  LOOP
    ids := grp.all_ids;
    keep_id := ids[1];
    FOREACH drop_id IN ARRAY ids[2:ARRAY_LENGTH(ids, 1)]
    LOOP
      -- Move messages that do not collide on primary key.
      UPDATE chat_messages m
      SET thread_id = keep_id
      WHERE m.thread_id = drop_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_messages x WHERE x.id = m.id AND x.thread_id = keep_id
        );

      DELETE FROM chat_messages WHERE thread_id = drop_id;

      -- Escrow is 1:1 with thread — keep the survivor's row.
      DELETE FROM escrow_transactions WHERE thread_id = drop_id;

      DELETE FROM chat_threads WHERE id = drop_id;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_buyer_seller_listing
  ON chat_threads (buyer_id, seller_id, listing_id);
