# COST_MAP.md
Estimates based on code-defined pricing and API call patterns. **No live billing data in repo** — operational costs inferred.

## AI cost per flow (Gemini — pay-per-use)
| Flow | Calls per action | Model | Relative cost |
|------|------------------|-------|---------------|
| Search intent (text) | 1× chat JSON | flash | Low |
| Search intent (visual) | 1× vision | flash | Medium |
| Listing extract (image) | 1× vision JSON | flash | Medium |
| Listing extract (combined) | 1× vision + text | flash | High |
| upload_media | 1× vision + embedding optional | flash | High |
| semantic-search | 1× embed query + DB scan | embedding-001 | Medium |
| image-search | 1× embed image | embedding-001 | Medium |
| visual-rank | 1× vision multi-image | flash | **High hotspot** |
| vauto-agent turn | 1× chat per message | flash | **High** (unbounded history) |
| negotiation-twin | 1× chat | flash | Medium |
| price-appraisal | 1× chat + DB | flash | Medium |
| Portal import | 1× scrape + 1× Gemini | flash + Playwright CPU | High |
| Boot backfill | up to 100× embed | embedding-001 | **High on cold start** |
| Browser duplicate | +1× if NEXT_PUBLIC key set | flash | **Double billing risk** |

**Rate limit:** 8 AI requests/min/user/IP — limits cost abuse partially.

**No token budget cap** in `vauto-agent` — cost runaway **RISK**.

## OCR cost
**NOT IMPLEMENTED** — included in Gemini vision pricing above.

## Image cost
| Service | When | Cost driver |
|---------|------|-------------|
| Cloudinary | `upload_media` success | Storage + transformations (unsigned preset) |
| sharp (server) | Watermark/resize | CPU on Render — no direct $ |
| Unsplash URLs | Demo/mock listings | Hotlinking (no API cost in code) |
| Image proxy | `/api/proxy/image` | Egress bandwidth Render |

Cloudinary env required — without it, upload path 503 (no cost, no feature).

## Shipping overhead
**MOCK ONLY** — no carrier API fees in code. Operational cost = $0 API; **reputational cost** if users expect real labels.

## Payment processing cost
| Item | Rate in code |
|------|--------------|
| Stripe subscription | Stripe standard fees (not in code) |
| Escrow platform fee | 5% `application_fee_amount` — **revenue** not cost |
| Connect transfer | Stripe Connect fees (external) |
| Demo wallet | $0 |

## Revenue vs cost per transaction (illustrative)
Assumptions from code only — not financial statements.

| Scenario | Revenue (code) | Main variable cost |
|----------|----------------|-------------------|
| Escrow sale €100 | €5 buyer fee (5%) | Stripe ~1.5-2.9% + €0.25; Gemini negligible per txn |
| Service lead open | €1.20 wallet debit | ~0 marginal |
| B2B Starter sub | €29/mo | Stripe fee; Gemini search for active pros |
| Smart boost C2C | €2.99 | Gemini promote copy if AI used |
| PPC click | €0.08 | ~0 marginal |

**Average transaction margin:** Cannot compute from code alone — **NOT IN REPO**. Platform fee 5% on escrow is the only explicit take rate in payment flow.

## Infrastructure fixed costs (deployment config)
| Service | Plan in code |
|---------|--------------|
| Render API | free tier `render.yaml` |
| Render Postgres | free tier |
| Vercel | not specified (likely hobby/pro) |
| Twilio SMS | per OTP |
| Gemini API | per token |
| Domain | external |

## Cost control gaps
- No per-user AI quota beyond rate limit.
- No cost alerting — **missing monitoring**.
- Boot embedding backfill on every deploy/wake — **CRITICAL** cost leak on cold starts.
- Public unauthenticated AI endpoints — abuse **RISK**.
