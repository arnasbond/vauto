# SECURITY_AUDIT.md
Based on code review of `server/src/*`, `src/*`, configs.

## Auth gaps **RISK**
| Issue | Location | Severity |
|-------|----------|----------|
| Legacy `x-user-id` header auth | `middleware/auth.ts` — enabled when `NODE_ENV !== production` or `ALLOW_LEGACY_USER_HEADER=true` | HIGH in misconfig |
| JWT dev secret fallback | `auth/tokens.ts` — `vauto-dev-secret-change-in-production` if JWT_SECRET unset | CRIT if prod misconfig (mitigated by `env-check.ts` exit) |
| Demo OTP `123456` | `auth/demo-phones.ts`, `otp-store.ts` | HIGH in prod if VAUTO_DEMO_OTP set |
| `loginLocal()` mock auth | `AuthContext.tsx` when API unavailable | MED — client-only trust |
| Admin elevation by email/phone defaults | `ADMIN_EMAIL=admin@vauto.com`, `ADMIN_PHONE=+37060000099` | HIGH if defaults unchanged in prod |
| `/api/test/e2e-simulation` | `routes/api.ts` — no auth | MED |
| `/api/bootstrap` | `routes/api.ts` — no auth, seeds DB | HIGH |

## Role leaks
- Non-admins stripped of `role`, `walletBalance` on PUT `/api/users/:id` (`api.ts:690-698`) — **good**.
- Admin routes use `requireAdmin` — **good**.
- Frontend admin UI gated by `isSuperAdminUser` — server must enforce (does on API).
- `profile_type` set once server-side — **good**.

## Route protection
| Area | Protection |
|------|------------|
| Most /api/* mutations | `requireAuth` |
| Admin endpoints | `requireAdmin` |
| Stripe webhook | Signature only (no JWT) — correct |
| /api/shipping/* | **No auth** — public locker list |
| /api/growth/referral/validate | Public |
| /api/listings GET | Public |
| /api/ai/* | Rate limit only — **no auth** **RISK** cost abuse |
| /api/vauto-agent | Rate limit only **RISK** |

## Secret exposure
| Finding | Status |
|---------|--------|
| Hardcoded `sk_live`/`sk_test` in src/ | **NOT FOUND** |
| `NEXT_PUBLIC_GEMINI_API_KEY` in browser | **RISK** — key visible in client bundle |
| JWT in localStorage | `vauto_access_token_v1` — XSS surface **RISK** |
| Firebase JSON in env | Server-only — OK |
| Default JWT secret string in source | **RISK** if env missing |

## Webhook security
- Stripe: signature verified — **good**.
- Portal cron: `X-Cron-Secret` header — **good** if secret strong.
- No other inbound webhooks found.

## File upload validation
- `POST /api/user/avatar` — image processing via sharp.
- `upload_media` in vauto-unified — sharp optimize + watermark.
- JSON body limit 25mb — **RISK** DoS via large payloads.
- Image proxy allow-list: `isAllowedProxyImageUrl` + content-type `image/*` — **good** SSRF mitigation for proxy only.

## Rate limits
- express-rate-limit tiers (`middleware/rate-limit.ts`).
- OTP send: in-memory 5/min per phone (`routes/auth.ts`).
- AI: 8/min — may be insufficient vs cost **RISK**.
- **NOT IMPLEMENTED:** Global IP ban, CAPTCHA, WAF.

## Injection risks
- SQL: parameterized queries via `pg` in repository — **low** (audit spot-check recommended).
- No raw SQL from user input observed in route handlers.
- Gemini prompts include user text — prompt injection **RISK** (no sandbox).

## SSRF risks **RISK**
| Vector | Mitigation |
|--------|------------|
| `/api/proxy/image` | Allow-list domains |
| `/api/ai/import-url` | User-supplied URL fetch — **verify allow-list in import-url handler** |
| Gemini image URL fetch | 12s timeout, http(s) only (`llm-provider.ts`) |
| Playwright portal scrape | User-linked URLs only |

## CORS **RISK**
`cors({ origin: true })` — reflects any origin (`index.ts`).

## Missing security controls
- Helmet.js — **NOT IMPLEMENTED**
- CSRF tokens — **NOT IMPLEMENTED** (JWT bearer mitigates partially)
- Request signing for mobile — **NOT IMPLEMENTED**
- Audit logging — **NOT IMPLEMENTED**
- Secrets rotation automation — **NOT IMPLEMENTED**

## Unprotected admin surfaces
- Frontend `/admin` pages — static export; protection is client-side + API `requireAdmin`.
- Direct API calls bypass UI — server enforces admin on sensitive routes.

## Hardcoded secrets scan
- `vauto-dev-secret-change-in-production` in `tokens.ts` — dev fallback **RISK**
- No production API keys in repo source (grep clean in `src/`)

## Localhost leaks
- `oauth-redirect.ts` — `http://localhost:3000` in allowed origins (expected dev)
- `capacitor.config.ts` — `https://vauto-chi.vercel.app` default remote
- `.env.example` documents `localhost:4000`
