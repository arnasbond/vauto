# DB_SCHEMA.md
Source: `server/migrations/*.sql` (000–020). PostgreSQL. String PKs (mobile localStorage compatible).

## Tables

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| name, phone, city, avatar_url, email | TEXT | |
| lat, lng | NUMERIC | |
| wallet_balance | NUMERIC | default 0 |
| role | TEXT | default `private` |
| business_type | TEXT | dealer/services/general |
| sold_count | INT | |
| auth_provider | TEXT | |
| billing_plan | TEXT | free/starter/pro/... |
| stripe_customer_id | TEXT | idx |
| stripe_connect_account_id | TEXT | Connect escrow |
| referral_code | TEXT UNIQUE | |
| free_protection_credits | INT | |
| referred_by_user_id | TEXT FK→users | |
| first_name, last_name, nickname | TEXT | |
| profile_type | TEXT CHECK | `private` \| `business` |
| warned | BOOLEAN | |

### listings
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| seller_id | TEXT FK→users CASCADE | |
| title, price, price_label, location | | |
| distance_km, latitude, longitude | | geo |
| slug | TEXT | SEO |
| image, category, tags JSONB | | |
| contact, has_video, description | | |
| attributes JSONB | | |
| status | TEXT | default `active` |
| banned, vin_verified, provider_verified, promoted | BOOL | |
| created_at, expires_at | TIMESTAMPTZ | |
| search_embedding JSONB | | text vector |
| image_embedding JSONB | | image vector |
| embedding_updated_at | | |
| min_negotiation_price | NUMERIC | |
| appraisal_score | NUMERIC | |
| is_verified, requires_review | BOOL | |
| image_alt, image_title | TEXT | |

### saved_listings
Composite PK (user_id, listing_id) — both FK CASCADE.

### chat_threads
id PK, listing_id FK, listing_title, buyer_id/seller_id FK, escrow_offered, last_read_at, sms_fallback_sent_for, updated_at.

### chat_messages
id PK, thread_id FK, sender_id FK, body, read_at, created_at. Index: `idx_chat_messages_thread`.

### escrow_transactions
| Column | Notes |
|--------|-------|
| id | PK |
| thread_id | FK UNIQUE (`idx_escrow_thread`) |
| listing_id, buyer_id, seller_id | FK |
| amount | NUMERIC |
| status | CHECK: offered, paying, paid, label_sent, shipped, delivered, completed, disputed, cancelled |
| tracking_code, shipping_label_id | |
| buyer_protection_fee, buyer_total | |
| stripe_payment_intent_id | idx partial |
| delivery_status | default pending |
| buyer_confirmed | |
| shipping_provider, shipping_locker_id/name | |
| express_escrow_24h, delivered_to_locker_at, claim_deadline_at | |
| courier_status, courier_provider | |

### support_reports
Reporter fields, category, urgency, status, comment, listing/chat refs, metadata JSONB, created_at. Indexes on status, metadata updatedAt.

### banned_users
user_id PK FK→users.

### seller_reviews
rating CHECK 1–5, seller_id, listing_id, reviewer fields. Indexes by seller/listing.

### wallet_transactions
kind CHECK: top_up, promote, refund, service_lead. user_id FK. **refund kind unused in routes.**

### push_subscriptions
endpoint, p256dh, auth_key. UNIQUE(user_id, endpoint).

### user_alert_queries
(user_id, query) PK.

### fcm_tokens / user_push_tokens
user_id, token. UNIQUE(user_id, token). Migration 019 migrates fcm→user_push_tokens.

### billing_subscriptions
user_id, plan_id, status, stripe_session_id, expires_at.

### service_leads + service_lead_opens
Pay-per-lead pipeline. urgency CHECK, lead_price default 1.2, required_specialties TEXT[]. Opens composite PK.

### admin_agent_context
admin_user_id PK, context_text.

### user_requirements
Buyer requirement/offer-engine. last_notified_listing_id. Indexes on user/active/match.

### market_price_history
Appraisal reference prices.

### user_notifications
kind, title, body, url, read_at.

### user_portal_links
user_id, portal_key UNIQUE, next_sync_at, last_item_hash, last_error. Partial index on next_sync.

### schema_migrations
version tracking (`000_schema_migrations.sql`).

## Relations (summary)
```
users 1─* listings (seller_id)
users 1─* saved_listings
users 1─* chat_threads (buyer/seller)
chat_threads 1─* chat_messages
chat_threads 1─1 escrow_transactions
users 1─* wallet_transactions
users 1─* user_portal_links
listings 1─* seller_reviews
users 1─* service_leads / service_lead_opens
```

## Indexes (notable)
- `idx_listings_created`, partial `idx_listings_has_embedding`, `idx_listings_has_image_embedding`
- `idx_users_stripe_customer`, `idx_users_referral_code`, `idx_users_profile_type`
- `idx_escrow_buyer`, `idx_escrow_stripe_pi`, `idx_escrow_delivery`
- `idx_chat_messages_thread`
- Portal sync due-queue partial index on `user_portal_links.next_sync_at`

## Constraints
- `profile_type` immutable after set (enforced in route logic, not DB trigger)
- Escrow status enum via CHECK
- Review rating 1–5 CHECK
- Wallet transaction kind enum

## NOT IMPLEMENTED
- pgvector extension (embeddings in JSONB only)
- Audit log table
- Idempotency keys table
- Job queue table
