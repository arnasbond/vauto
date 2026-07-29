# External portal listing import — REMOVED

MVP decision (2026-07): VAUTO no longer scrapes or syncs listings from external portals
(Autoplius, Aruodas, Skelbiu, Vinted, etc.).

Native listing create (AI photo/chat → PrePublish) is the only ingestion path.
Wardrobe/Spinta branding for the fashion cabinet remains as UX, not portal sync.

Dropped surfaces:
- `/api/spinta/*`, `/api/ai/import-url`, `/api/ai/import-wardrobe-profile`
- Playwright portal scraper, `user_portal_links` table (migration `019_drop_user_portal_links.sql`)
- Frontend URL import cards and portal link center
