import { pool } from "../db.js";

/** Returns true when this Stripe event id is new and should be processed. */
export async function claimStripeWebhookEvent(
  eventId: string,
  eventType: string
): Promise<boolean> {
  const result = await pool.query<{ event_id: string }>(
    `INSERT INTO stripe_webhook_events (event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, eventType]
  );
  return (result.rowCount ?? 0) > 0;
}
