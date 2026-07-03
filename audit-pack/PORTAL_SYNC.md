# PORTAL_SYNC.md
Source: `server/src/routes/spinta.ts`, `server/src/spinta/*`, `src/lib/api/client.ts`, `src/lib/spinta-portal.ts`.

## Supported portals (code-defined)
skelbiu, autoplius, aruodas, paslaugos, vinted, marktplaats, ebay, depop, poshmark, olx (`WARDROBE_PORTALS` in `spinta-portal.ts`).

## Import
| Action | API | Implementation |
|--------|-----|----------------|
| Link portal profile URL | PUT /api/spinta/portals | DB `user_portal_links` |
| Scrape + AI parse profile | POST /api/spinta/import | `portal-profile-scraper.ts` (Playwright) → Gemini |
| Wardrobe bulk import | apiImportWardrobeProfile | `wardrobe-profile-importer.ts` |
| Single listing from URL | apiImportListingFromUrl | `listing-url-import.ts` → `/api/ai/import-url` |

Scraper disabled when `PORTAL_SCRAPER_DISABLED=1`.

## Refresh / Sync
| Action | API | Implementation |
|--------|-----|----------------|
| User-triggered sync | POST /api/spinta/sync (auth) | `runPortalSyncBatch` |
| Cron batch | POST /api/spinta/sync + `X-Cron-Secret` | Same batch |
| In-process cron | `portal-sync-cron.ts` | Daily 04:15 Europe/Vilnius, max **6 links**/run |
| Boot delay sync | 3 min after server start | One-off batch |

Change detection: `last_item_hash` on `user_portal_links` — re-import if hash differs.

## Publish
| Action | API | Notes |
|--------|-----|-------|
| Create VAUTO listing | POST /api/listings | Standard publish |
| Update listing | PATCH /api/listings/:id | |
| Renew / refresh | POST /api/listings/:id/renew | 90-day extension |
| Push to external portal | **NOT IMPLEMENTED** | No outbound publish to Skelbiu/Autoplius APIs |

## Delete
| Action | API |
|--------|-----|
| Delete VAUTO listing | DELETE /api/listings/:id |
| Unlink portal | DELETE /api/spinta/portals/:portalKey |
| Delete on external portal | **NOT IMPLEMENTED** |

## Consistency model
- **Eventually consistent** — cron batch, no real-time sync.
- **Single-process** — `batchRunning` guard prevents parallel batches on one instance.
- **No distributed lock** — multiple Render instances could duplicate sync **RISK**.
- **No queue** — due links selected by `next_sync_at` query, processed inline.
- Errors stored in `user_portal_links.last_error`; `next_sync_at` rescheduled.

## Bottlenecks **RISK**
| Issue | Detail |
|-------|--------|
| maxLinks: 6 per run | Large user base backlog |
| Playwright per link | CPU/RAM heavy on Render free tier |
| Shared browser instance | Single Chromium — serial scrape |
| No retry queue | Failed links wait until next cron |
| Gemini per import | Cost + 25s timeout per item |

## Frontend session
`src/lib/wardrobe-spinta-session.ts` — client sync state.
`apiSpintaSync` in `client.ts:822`.

## Missing
- Outbound two-way sync (VAUTO ↔ portal)
- Webhook from portals
- Idempotency keys for import
- Dead-letter queue for failed scrapes
