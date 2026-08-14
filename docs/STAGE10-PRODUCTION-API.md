# Stage 10 — Production API (Etapas 10J / 10K)

All routes require JWT (`Authorization: Bearer …`). Mount: **`/api/stage10`**.

Base: `https://<api-host>/api/stage10`

| Method | Path | Module | Body / notes |
|--------|------|--------|----------------|
| GET | `/health` | — | Stage `10K` + `serverAuthoritative: true` |
| POST | `/intent` | 10A | `{ "text": "…" }` |
| POST | `/search` | 10B | `{ "text": "…", "limit?": 40 }` — catalog from real DB |
| POST | `/sell/draft` | 10C | Real Vision + image safety; **never auto-publishes** |
| POST | `/market/valuation` | 10D | **`{ listingId }` only** — server loads comps (C-01) |
| POST | `/score` | 10E | **`{ listingId }` only** — server loads seller/demand/tx (C-01) |
| POST | `/match` | 10F | Buyer Match request + `candidateListingIds` from DB |
| POST | `/compare` | 10G | `{ "listingIds": [2–4] }` — unauthorized/private filtered |
| POST | `/watch` | 10H | Create watch (owned by `authUserId`) |
| GET | `/watch` | 10H | List own watches |
| GET | `/watch/:id` | 10H | Get own watch (`id` + `user_id`) |
| PATCH | `/watch/:id` | 10H | Update own watch |
| DELETE | `/watch/:id` | 10H | Soft-delete own watch |
| GET | `/watch-notifications` | 10H | Own notifications only |

## Ownership & events

- Watch CRUD: `WHERE id = $1 AND user_id = $authenticatedUserId`.
- Notifications FK: `(rule_id, user_id) → ai_watches(id, user_id)`.
- Production store: `AiWatchRepository` (PostgreSQL).
- Migrations: `036_ai_watch_1.0.sql`, `037_ai_watch_outbox_10k.sql`.
- Listing create/update → durable `ai_watch_outbox` enqueue + background worker.

## Non-goals

- Stage 11 product features — **not started**.
