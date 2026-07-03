# ARCHITECTURE.md
Based on repo at commit state; version **1.6.4** (package.json). Production deploy referenced as **vauto-chi.vercel.app** + **vauto-api.onrender.com**.

## Frontend
- **Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4, static export (`out/`), Capacitor 6 (Android/iOS).
- **Entry:** `src/app/layout.tsx`, pages under `src/app/**/page.tsx` (~27 routes).
- **State:** 18 React contexts; root tree in `src/context/AppProviders.tsx` → `AuthProvider` → `VautoProvider`.
- **API client:** `src/lib/api/client.ts` (~90 `api*` functions), `dataFetch<T>()` discriminated union.
- **Config:** `src/lib/api/config.ts` — `NEXT_PUBLIC_API_URL` at build + `/runtime-config.json` at runtime.
- **No Next.js API routes:** `src/app/api/**` — **NOT IMPLEMENTED**. Vercel rewrites proxy `/api/ai/*`, `/api/vauto-agent`, `/api/vauto-server` to Render (`vercel.json`).

## Backend
- **Stack:** Express 4 + TypeScript (`server/src/index.ts`), PostgreSQL via `pg`.
- **Mount order:** CORS → Stripe webhook (raw body) → JSON 25mb → `optionalAuth` → routers.
- **Routers:** `api`, `auth`, `push`, `spinta`, `ai`, `vauto-server`, `vauto-agent`, `billing`, `escrow-billing`, `growth`, `shipping`, `search`.
- **Repository:** `server/src/repository.ts`, portal links `repository-portal-links.ts`.

## DB
- **Engine:** PostgreSQL (Render `vauto-db`, local `docker-compose.yml`).
- **Migrations:** `server/migrations/000`–`020` (additive).
- **Embeddings:** JSONB columns on `listings` (no pgvector). Cosine search in application code.
- **Schema tracking:** `000_schema_migrations.sql`.

## Auth
- **Server:** Custom HS256 JWT (`server/src/auth/tokens.ts`), OTP via Twilio (`auth/sms.ts`, `auth/otp-store.ts`), Google/Apple social (`routes/auth.ts`).
- **Middleware:** `optionalAuth`, `requireAuth`, `requireAdmin` (`middleware/auth.ts`).
- **Frontend:** `src/context/AuthContext.tsx`, persistence `lib/auth/persistence.ts`, `lib/auth/session.ts`.
- **Guards:** `SessionAutoLoginGuard`, `GlobalAuthModal`, profile-type picker on `/auth-gate`.
- **Demo fallback:** `loginLocal()` when API unavailable — **MOCK ONLY**.

## AI
- **Provider:** Google Gemini only (`server/src/ai/llm-provider.ts`). Models: `gemini-2.5-flash` → fallback `gemini-2.5-flash-lite`.
- **Frontend tier:** Browser Gemini (`NEXT_PUBLIC_GEMINI_API_KEY`) → server proxy → local mocks (`src/lib/ai-mocks.ts`).
- **OCR:** **NOT IMPLEMENTED** as separate engine — vision extraction via Gemini (`/api/ai/extract-image`, `/extract-combined`).
- **Image hosting:** Cloudinary unsigned upload (`server/src/ai/cloudinary.ts`) — requires env or 503.

## OCR
- **NOT IMPLEMENTED** (dedicated OCR). All text-from-image flows use Gemini vision.

## Payments
- **Provider:** Stripe (`stripe@17.7.0`).
- **B2B subscriptions:** `server/src/billing/stripe-plans.ts`, routes `billing.ts`.
- **Escrow:** Stripe Connect + manual capture (`escrow-billing.ts`, `billing/stripe-b2b.ts`).
- **Frontend demo:** `src/lib/payments/payment-provider.ts` — **MOCK ONLY** (`createDemoPaymentIntent`).

## Shipping
- **IMPLEMENTED:** Carrier adapter layer (`carrier-adapter.ts`, `carrier-adapters.ts`) with `live | simulated` mode.
- **Live keys BLOCKED:** Omniva/DPD adapters exist; production uses `simulated` until env keys set.
- Synthetic lockers + distance heuristics (`shipping-routing.ts`) for locker search / route estimate.
- Escrow labels via `resolveCarrierAdapter()` in `escrow-billing.ts` — returns `label.mode`.

## Notifications
- **Web Push:** VAPID (`server/src/push/web-push.ts`), routes `push.ts`.
- **FCM:** Firebase Admin (`services/push-service.ts`) — optional via `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **Email:** Resend (`push/report-email.ts`) for admin report alerts.
- **In-app:** `user_notifications` table, SSE report stream (`reports/report-bus.ts`).
- **Capacitor:** `@capacitor/push-notifications` on client.

## Portal sync (Spinta)
- **Linked portals:** skelbiu, autoplius, aruodas, paslaugos, vinted, marktplaats, ebay, depop, poshmark, olx (`src/lib/spinta-portal.ts`).
- **Scraper:** Playwright headless (`server/src/spinta/portal-profile-scraper.ts`), fetch fallback.
- **Cron:** `node-cron` daily 04:15 Europe/Vilnius (`spinta/portal-sync-cron.ts`), batch max 6 links.
- **API:** `server/src/routes/spinta.ts` — import, sync, portal CRUD.
- **No message queue** — in-process batch only.

## Deploy
| Target | Role | Config |
|--------|------|--------|
| Vercel | Static Next export + API rewrites | `vercel.json`, `out/` |
| Render | Express API + cron | `render.yaml`, `server/Dockerfile` |
| Docker local | Postgres | `docker-compose.yml` |
| Capacitor | Mobile shells | `capacitor.config.ts` → remote `vauto-chi.vercel.app` |
