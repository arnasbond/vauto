# AI_PIPELINE.md
Source: `server/src/ai/*`, `src/lib/gemini-*.ts`, `src/lib/client-api.ts`, `src/lib/ai-mocks.ts`.

## Entry points

### Server (Gemini REST)
| Endpoint | Handler file | Input |
|----------|--------------|-------|
| POST /api/ai/* | `routes/ai.ts` | JSON + optional images |
| POST /api/vauto-server | `routes/vauto-server.ts` → `ai/vauto-unified.ts` | actions: parse_text, analyze, analyze_image, parse_combined, upload_media |
| POST /api/vauto-agent | `routes/vauto-agent.ts` | chat messages |
| POST /api/search/vision | `routes/api.ts` | legacy vision search |
| POST /api/reports | `routes/api.ts` | report enrich via Gemini |
| POST /api/spinta/import | `routes/spinta.ts` | scraped HTML → Gemini |
| POST /api/bootstrap | `routes/api.ts` | embedding backfill |

### Frontend
| Flow | Files |
|------|-------|
| Search intent | `gemini-search-intent.ts` → `search-query-parse.ts` fallback |
| Listing extract | `client-api.ts` → `gemini-browser.ts` → `api/ai/*` → `ai-mocks.ts` |
| Photo vision search | `photo-vision-search.ts` |
| Wardrobe / mirror | `wardrobe-vision.ts`, `magic-mirror.ts` |
| Agent chat | `vauto-agent-client.ts`, `VautoAgentContext.tsx` |
| Voice | `voice-intent.ts`, `/api/ai/analyze-voice` |

## Provider order
1. **Browser Gemini** — if `NEXT_PUBLIC_GEMINI_API_KEY` (`gemini-browser.ts`) — bypasses Render for IP-blocked regions.
2. **Server Gemini** — if `GEMINI_API_KEY` / `AI_KEY` / `GOOGLE_AI_API_KEY` (`load-env.ts`).
3. **Local mocks** — `src/lib/ai-mocks.ts` (**MOCK ONLY**, 1500ms delay).
4. **Heuristic fallback** — `search-query-parse.ts`, `createManualFallbackDraft` (`ai-safeguards.ts`).

Server: **Gemini-only**. `resolveAiProvider()` returns `gemini` or `null` — no OpenAI/Anthropic.

## Models
| Use | Model | File |
|-----|-------|------|
| Chat/vision JSON | `gemini-2.5-flash` → `gemini-2.5-flash-lite` | `llm-provider.ts` |
| Embeddings | `gemini-embedding-001` | `listing-embedding.ts`, `image-embedding.ts` |
| Endpoint | `generativelanguage.googleapis.com/v1beta` | `llm-provider.ts` |

## Fallbacks
- Model downgrade flash → flash-lite on failure (`UNIFIED_GEMINI_MODELS`).
- JSON parse: fence extraction, brace slicing (`llm-provider.ts`).
- Missing API key → HTTP **503** `"GEMINI_API_KEY not set"` (no silent mock on server).
- Client: manual form fallback toast (`MANUAL_FALLBACK_TOAST` in `ai-safeguards.ts`).

## Retries
- **NOT IMPLEMENTED** — no automatic retry loop on Gemini 429/5xx in `llm-provider.ts`.
- Boot-time embedding backfill runs once (50 text + 50 image), not continuous retry queue.

## Timeouts
| Layer | MS | File |
|-------|-----|------|
| Server Gemini fetch | 25,000 | `llm-provider.ts` **CRITICAL** (Render ~30s limit) |
| Server image URL fetch | 12,000 | `llm-provider.ts` |
| Client AI fetch | 12,000 | `ai-safeguards.ts` |
| Client vision fetch | 26,000 | `ai-safeguards.ts` |
| Client processing ceiling | 28,000 | `ai-safeguards.ts` |
| Client mock | 5,000 | `ai-mocks.ts` |

## Caching
- Listing embeddings persisted in DB (`listings.search_embedding`, `image_embedding`).
- **NOT IMPLEMENTED:** Redis/in-memory response cache for Gemini calls.
- Browser: no explicit Gemini response cache in code.

## Fail states
| State | Behavior |
|-------|----------|
| No Gemini key | Server 503; client falls to mock/heuristic |
| Timeout | `AiSafeguardError` code `timeout`; manual fallback UI |
| Invalid JSON from Gemini | Parse error → 500 or client fallback |
| Placeholder titles | Blocked via `DEMO_AI_PLACEHOLDER_TITLES` set |
| Cloudinary missing | `upload_media` → 503 |

## Cost hotspots **RISK**
| Flow | Why expensive |
|------|---------------|
| `/api/ai/extract-combined` | Vision + large JSON per upload |
| `/api/ai/visual-rank` | Multi-image Gemini per search |
| `/api/vauto-server` upload_media | Vision + Cloudinary + watermark (sharp) |
| Embedding backfill | `gemini-embedding-001` × all listings on boot |
| `/api/vauto-agent` | Multi-turn chat, no token budget cap in code |
| Browser + server double-call | Same query may hit Gemini twice if both keys set |
| Portal import | Playwright + Gemini per profile |

## OCR
**NOT IMPLEMENTED** — all "OCR" is Gemini vision.
