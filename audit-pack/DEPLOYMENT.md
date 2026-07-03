# DEPLOYMENT.md

## Vercel (frontend)
| Setting | Value |
|---------|-------|
| Config | `vercel.json` |
| Framework | null (static) |
| Build | `npm run build` |
| Output | `out/` |
| Env | `NEXT_PUBLIC_API_URL=https://vauto-api.onrender.com` |
| Rewrites | `/api/ai/*`, `/api/vauto-agent`, `/api/vauto-server`, `/api/search/*` → Render |
| SPA slugs | `/listing/:slug` → `/listing/index.html?slug=` |
| Cache | no-cache on `/profile/*`, `/admin/*`, `/fashion/*` |

Runtime config: `public/runtime-config.json` (can override API URL without rebuild if synced).

## Render (backend)
| Setting | Value |
|---------|-------|
| Blueprint | `render.yaml` |
| Service | `vauto-api` |
| Runtime | Docker (`server/Dockerfile`) |
| Plan | **free** **RISK** cold starts |
| Region | frankfurt |
| Health check | `/api/health` |
| DB | `vauto-db` PostgreSQL free tier |

Provision scripts: `scripts/provision-render.mjs`, `configure-render-env.mjs`, `redeploy-render.mjs`.

## Cron jobs
| Job | Schedule | File | Env gate |
|-----|----------|------|----------|
| Portal sync batch | `15 4 * * *` Europe/Vilnius | `portal-sync-cron.ts` | `ENABLE_PORTAL_SYNC_CRON !== false` |
| Boot backfill embeddings | Once on start | `index.ts` | `hasAiKey()` |
| Boot Stripe bootstrap | Once on start | `ensure-stripe.ts` | `STRIPE_AUTO_WEBHOOK=1` |
| Boot portal sync | +3 min after start | `portal-sync-cron.ts` | same |

External cron option: `POST /api/spinta/sync` with `X-Cron-Secret`.

## Workers
**NOT IMPLEMENTED** — no separate worker service. Playwright + cron run in API process.

## Queues
**NOT IMPLEMENTED** — no BullMQ, Redis, SQS. In-process `batchRunning` flag only.

## Health checks
| Endpoint | Checks |
|----------|--------|
| GET /api/health | DB ping, feature flags, embedding stats, readiness score 0-100 |
| GET /api/ai/health | Gemini key present |
| GET /api/search/health | Router alive |
| scripts/verify-health.mjs | External smoke (strict mode optional) |

Readiness factors (`api.ts`): sms, googleOAuth, webPush, fcm, jwt, gemini, stripe, stripeWebhook, vehicleLookup, serviceLeads, embeddingsSynced, regitra.

## Cold start risks **CRITICAL**
- Render free tier sleeps → 30s+ wake → Playwright prod E2E timeouts observed.
- Boot embedding backfill adds Gemini load on wake.
- Single Docker container runs Express + Chromium.

## Mobile deploy
- Capacitor `capacitor.config.ts` — remote URL `vauto-chi.vercel.app` when `CAPACITOR_USE_REMOTE=1`.
- APK via `scripts/build-apk.ps1`, GitHub releases linked in `vercel.json` `/download/vauto.apk`.

## Local dev
- `docker-compose.yml` — Postgres.
- `npm run dev` — Next.js :3000.
- `npm run server:dev` — Express :4000.

## CI/CD
- `.github/` present — verify workflows separately.
- No automated Playwright in CI config found in package.json scripts beyond local `test:e2e`.

## Missing monitoring
- Sentry/Datadog/New Relic — **NOT IMPLEMENTED** in dependencies.
- Structured metrics export — **NOT IMPLEMENTED**.
- Uptime alerting — relies on Render/Vercel platform.
