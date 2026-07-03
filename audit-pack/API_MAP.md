# API_MAP.md
Source: `server/src/index.ts` + route files. Vercel rewrites selected paths to Render.

**Risk levels:** LOW = public read; MED = auth required; HIGH = admin/AI/payment; CRIT = webhook/raw body.

## Stripe webhook (raw body, before JSON parser)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| POST | /api/billing/webhook | Stripe events (checkout, subscription) | STRIPE_WEBHOOK_SECRET, DB | CRIT |

## /api — `server/src/routes/api.ts` (apiRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/proxy/image | Image proxy (allow-list) | fetch, sharp | MED |
| GET | /api/version | App version payload | env | LOW |
| GET | /api/health | DB + feature readiness score | DB, env | LOW |
| GET | /api/test/e2e-simulation | QA buyer/seller simulation | DB | MED **RISK** unauthenticated |
| POST | /api/bootstrap | Demo seed + embedding backfill | DB, Gemini | HIGH **RISK** unauthenticated |
| POST | /api/admin/backfill-embeddings | Embedding backfill | requireAdmin, Gemini | HIGH |
| POST | /api/admin/setup-stripe | Stripe portal/webhook setup | requireAdmin, Stripe | HIGH |
| GET | /api/listings | Listing feed | DB | LOW |
| POST | /api/listings | Create listing | requireAuth, DB, push | MED |
| DELETE | /api/listings/:id | Delete own listing | requireAuth, DB | MED |
| POST | /api/listings/:id/renew | Renew listing | requireAuth, DB | MED |
| PATCH | /api/listings/:id | Update listing | requireAuth, DB | MED |
| GET | /api/reports | All reports | requireAdmin, DB | HIGH |
| GET | /api/reports/mine | User reports | requireAuth, DB | MED |
| GET | /api/reports/stream | SSE report stream | requireAuth | MED |
| POST | /api/reports | Create report (+AI enrich) | requireAuth, DB, Gemini | MED |
| PATCH | /api/reports/:id | Update report | requireAuth, DB | MED |
| GET | /api/banned-users | List banned | requireAdmin | HIGH |
| PUT | /api/banned-users | Set banned list | requireAdmin, DB | HIGH |
| PATCH | /api/admin/listings/:id | Ban / status | requireAdmin, DB | HIGH |
| POST | /api/users/:id/warn | Warn user | requireAdmin, DB | HIGH |
| GET | /api/admin/agent-project-context | Admin AI context | requireAdmin, DB | HIGH |
| PUT | /api/admin/agent-project-context | Set AI context | requireAdmin, DB | HIGH |
| PUT | /api/user/profile | Update profile | requireAuth, DB | MED |
| POST | /api/user/avatar | Avatar from image | requireAuth, sharp/Cloudinary | MED |
| POST | /api/user/profile-type | Set private/business | requireAuth, DB | MED |
| POST | /api/user/push-token | Register push token | requireAuth, DB | MED |
| GET | /api/users/:id | Get user | requireAuth, DB | MED |
| PUT | /api/users/:id | Update user | requireAuth, DB | MED |
| PATCH | /api/users/:id/avatar | Avatar URL | requireAuth, DB | MED |
| GET | /api/saved/:userId | Saved listings | requireAuth, DB | MED |
| PUT | /api/saved/:userId | Update saved | requireAuth, DB | MED |
| GET | /api/chats/:userId | Chat threads | requireAuth, DB | MED |
| PUT | /api/chats | Upsert thread | requireAuth, DB, push | MED |
| GET | /api/escrow/thread/:threadId | Escrow by thread | requireAuth, DB | MED |
| PUT | /api/escrow | Upsert escrow | requireAuth, DB | MED |
| GET | /api/reviews | List reviews | DB | LOW |
| POST | /api/reviews | Create review | requireAuth, DB | MED |
| POST | /api/wallet/top-up | Demo wallet credit | requireAuth, DB | HIGH **MOCK ONLY** prod blocked |
| POST | /api/listings/:id/promote | Promote via wallet | requireAuth, DB | MED |
| POST | /api/vehicle/lookup | VIN/plate lookup | NHTSA/Regitra | MED |
| GET | /api/service-leads | Service leads | requireAuth, DB | MED |
| POST | /api/service-leads | Create lead | requireAuth, DB | MED |
| POST | /api/service-leads/:id/open | Open lead (wallet debit) | requireAuth, DB | MED |
| POST | /api/requirements | Buyer requirement | requireAuth, DB | MED |
| POST | /api/search/vision | Legacy photo→keywords | Gemini | HIGH |

## /api/auth — `server/src/routes/auth.ts` (authRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| POST | /api/auth/otp/send | Send OTP | Twilio, in-memory rate limit | MED |
| POST | /api/auth/otp/verify | Verify OTP + JWT | DB, JWT | MED |
| POST | /api/auth/social | Google/Apple login | Google verify, DB | MED |
| GET | /api/auth/session | Refresh session | requireAuth, DB | MED |
| POST | /api/auth/logout | Logout | requireAuth | LOW |
| POST | /api/auth/upgrade | Upgrade to pro | requireAuth, DB | MED |

## /api/push — `server/src/routes/push.ts`
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/push/vapid-public-key | VAPID public key | env | LOW |
| POST | /api/push/subscribe | Web push subscribe | DB | MED |
| POST | /api/push/unsubscribe | Unsubscribe | DB | MED |
| POST | /api/push/fcm-token | FCM token | DB, Firebase | MED |
| GET | /api/push/alert-queries | Alert queries | requireAuth, DB | MED |
| PUT | /api/push/alert-queries | Set alerts | requireAuth, DB | MED |

## /api/spinta — `server/src/routes/spinta.ts` (actionRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/spinta/portals | Portal links | requireAuth, DB | MED |
| PUT | /api/spinta/portals | Link portal | requireAuth, DB | MED |
| DELETE | /api/spinta/portals/:portalKey | Unlink | requireAuth, DB | MED |
| POST | /api/spinta/import | Import wardrobe profile | Playwright, Gemini | HIGH |
| POST | /api/spinta/sync | Cron or user sync batch | SPINTA_SYNC_CRON_SECRET or auth | HIGH |

## /api/ai — `server/src/routes/ai.ts` (aiRateLimiter, 8/min)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/ai/health | AI key status | env | LOW |
| POST | /api/ai/extract-image | Vision listing extract | Gemini | HIGH |
| POST | /api/ai/analyze-voice | Voice→listing | Gemini | HIGH |
| POST | /api/ai/analyze-search | Search intent JSON | Gemini | HIGH |
| POST | /api/ai/analyze-search-visual | Visual search intent | Gemini | HIGH |
| POST | /api/ai/analyze-wardrobe-photo | Wardrobe vision | Gemini | HIGH |
| POST | /api/ai/express-escrow-locker | Express escrow locker pick | Gemini, **MOCK** shipping | HIGH |
| POST | /api/ai/process-express-escrow | 24h auto-confirm sim | DB | HIGH |
| POST | /api/ai/import-wardrobe-profile | Profile import AI | Gemini | HIGH |
| POST | /api/ai/magic-mirror-fit | Clothing fit | Gemini | HIGH |
| POST | /api/ai/price-appraisal | Price appraisal | Gemini, DB | HIGH |
| POST | /api/ai/negotiation-twin | AI negotiation | Gemini | HIGH |
| POST | /api/ai/generate-description-personas | Description variants | Gemini | HIGH |
| POST | /api/ai/chat-shield | Chat moderation | Gemini | HIGH |
| POST | /api/ai/reference-images | Wikimedia refs | fetch | MED |
| POST | /api/ai/extract-combined | Text+image extract | Gemini | HIGH |
| POST | /api/ai/import-url | URL scrape import | fetch, Gemini | HIGH **SSRF RISK** |
| POST | /api/ai/extract-text | Text extract | Gemini | HIGH |
| POST | /api/ai/image-search | Embedding image search | DB, Gemini | HIGH |
| POST | /api/ai/semantic-search | Text embedding search | DB, Gemini | HIGH |
| POST | /api/ai/visual-rank | Visual re-rank | Gemini, DB | HIGH |
| POST | /api/ai/listing-share | Share card gen | Gemini | MED |
| POST | /api/ai/analyze-report | Report AI enrich | Gemini | HIGH |

## /api/vauto-server — `server/src/routes/vauto-server.ts` (aiRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| POST | /api/vauto-server | Unified parse/analyze/upload | Gemini, Cloudinary, sharp | HIGH |

## /api/vauto-agent — `server/src/routes/vauto-agent.ts` (aiRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| POST | /api/vauto-agent | Conversational agent | Gemini, admin context | HIGH |

## /api/billing — `server/src/routes/billing.ts`
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| POST | /api/billing/confirm | Confirm checkout session | requireAuth, Stripe, DB | HIGH |
| POST | /api/billing/portal | Stripe customer portal | requireAuth, Stripe | HIGH |
| POST | /api/billing/subscribe | B2B subscription checkout | requireAuth, Stripe, DB | HIGH |

## /api/escrow-billing — `server/src/routes/escrow-billing.ts`
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/escrow-billing/status | Escrow feature flags | env | LOW |
| POST | /api/escrow-billing/checkout | Escrow checkout (manual capture) | requireAuth, Stripe Connect | CRIT |
| POST | /api/escrow-billing/confirm-session | Mark paid | requireAuth, DB | CRIT |
| POST | /api/escrow-billing/shipping-label | **MOCK** label generation | requireAuth, DB | HIGH |
| POST | /api/escrow-billing/confirm-delivery | Capture PI + referral | requireAuth, Stripe, DB | CRIT |

## /api/growth — `server/src/routes/growth.ts`
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/growth/notifications | User notifications | requireAuth, DB | MED |
| GET | /api/growth/referral/me | Referral code/stats | requireAuth, DB | MED |
| POST | /api/growth/referral/apply | Apply referral | requireAuth, DB | MED |
| POST | /api/growth/referral/validate | Validate code | DB | LOW |

## /api/shipping — `server/src/routes/shipping.ts`
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/shipping/lockers | **MOCK** locker list | local geo table | LOW |
| POST | /api/shipping/route-estimate | **MOCK** transit estimate | local math | LOW |

## /api/search — `server/src/routes/search.ts` (searchRateLimiter)
| METHOD | Route | Purpose | depends_on | risk |
|--------|-------|---------|------------|------|
| GET | /api/search/health | Search router health | — | LOW |

**Note:** Semantic/visual search lives under `/api/ai/*`, not `/api/search/*`.

## Frontend-only (no server route in repo)
- Next.js `src/app/api/**` — **NOT IMPLEMENTED**
- Client search ranking — in-browser (`VautoContext`, mock catalog)
