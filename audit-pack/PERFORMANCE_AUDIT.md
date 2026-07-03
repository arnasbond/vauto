# PERFORMANCE_AUDIT.md

## Slow routes (server)
| Route | Why slow | File |
|-------|----------|------|
| POST /api/ai/* | Gemini 25s timeout, vision payloads | `llm-provider.ts` |
| POST /api/vauto-server | Vision + sharp + Cloudinary | `vauto-unified.ts` |
| POST /api/spinta/import | Playwright page load + Gemini | `portal-profile-scraper.ts` |
| POST /api/bootstrap | Seed + 50+50 embedding backfill | `routes/api.ts` |
| POST /api/admin/backfill-embeddings | Bulk Gemini embedding | `listing-embedding.ts` |
| GET /api/listings | Full table scan potential (no cursor pagination audit) | `repository.ts` |
| POST /api/ai/semantic-search | JSONB cosine over all indexed listings | in-memory loop |

## Blocking operations
- Playwright scrape — blocks event loop thread during browser ops.
- `sharp` image processing — synchronous CPU on main thread.
- Embedding backfill on server boot (`index.ts:77-92`) — blocks startup completion.
- Stripe webhook handler — synchronous DB updates in request path.

## Heavy AI calls
- Duplicate client+server Gemini for same user action if both keys configured.
- `/api/vauto-agent` — unbounded conversation history sent to Gemini.
- Visual rank / semantic search — O(n) over listings with embedding JSON parse per row.

## Render bottlenecks **RISK**
| Issue | Detail |
|-------|--------|
| Free tier plan | `render.yaml` plan: free — cold starts |
| 30s request limit | Gemini timeout set to 25s — tight margin |
| Single instance | No horizontal scaling config |
| Playwright on API server | Chromium RAM on same container as Express |
| Boot backfill | 100 embedding API calls on every cold start if triggered |

## Memory leaks (potential)
- In-memory OTP rate limit Map (`routes/auth.ts`) — grows unbounded **RISK**.
- SSE report subscribers (`report-bus.ts`) — `setInterval` heartbeat; cleanup on disconnect depends on client close.
- Playwright shared browser — must be closed on shutdown (verify `portal-profile-scraper.ts` lifecycle).

## Expensive DB queries
- Listing feed without verified LIMIT on all code paths — check `getListings()`.
- Embedding stats query on every `/api/health`.
- Portal sync due-queue — partial index helps (`user_portal_links.next_sync_at`).
- Chat thread load — N+1 possible on messages fetch.

## Frontend performance
- `VautoContext.tsx` ~2200 lines — large context re-renders **RISK**.
- Static export 190+ pages — build time heavy.
- Leaflet map + supercluster — client-side OK.
- `networkidle` in E2E — not prod issue but indicates long-polling/websockets on home.

## Missing optimizations
- CDN for listing images — uses external URLs / Cloudinary when uploaded.
- Response compression middleware — **NOT IMPLEMENTED** explicitly in Express.
- DB connection pooling — uses `pg` Pool (standard).
- Query result caching — **NOT IMPLEMENTED**.
- CDN edge for `/api/*` — all on Render Frankfurt.

## Cold start risks **CRITICAL**
Render free tier spin-down → first request 30-60s+ → AI timeouts, E2E prod failures observed (13 failures in old prod run due to 30s timeout).
