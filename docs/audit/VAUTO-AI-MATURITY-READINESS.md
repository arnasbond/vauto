# VAUTO AI Maturity Readiness

Read-only inventory + minimum implementation plan for the mandatory AI maturity block.
Evidence base: repository @ `8f80480` (master). This is preparation, not implementation.

---

## 1. Current AI Stack Inventory

### 1.1 Assistant orchestration
- `src/context/VautoAgentContext.tsx` — central client orchestrator: `open`/`busy` flags, history trim `.slice(-6)` in `resetPublishSession`, SSE stream via `apiVautoAgentStream` + fallback `apiVautoAgent`, wake-words, `commitVisionObjectSellToPrePublish` (local-only "Parduoti…" path → `AWAITING_CONFIRMATION` + PrePublish card, no server/LLM), `revealPrePublishCard`, `resetPublishSession`.
- `src/lib/api/vauto-agent-stream.ts` — `MAX_DATA_URLS_ON_WIRE = 10`, `capImageUrlsForAgentWire`.
- `src/lib/agent-busy-gate.ts` — queue caps (`MAX_QUEUE = 3`, `MAX_BACKGROUND = 1`).
- `src/lib/agent-chat-layout.ts` — `isBlockedFallbackBubble`, `stripGenericFallbackAssistants`, `isEmbeddedAgentChatVisible`.

### 1.2 System prompts
`server/src/ai/` (74 modules) — distinct instruction layers:
- `agent-system-instruction.ts` — `buildVautoAgentSystemInstruction` = supervisor + `GEMINI_INTENT_RULES` (or `_COMPACT`).
- `supervisor-system-instruction.ts` — broker persona + `VAUTO_DOMAIN_AUTONOMY_RULES`.
- `gemini-intent-rules.ts` — safety, error tolerance, audience adaptation, B2B, empathy.
- `vision-guardrails.ts` — 9 prompt constants (anti-stale-title, master sales copywriter, deep OCR, anti-hallucination ×4, wardrobe, gabaritas).
- `search-intent.ts` — `SEARCH_ERROR_TOLERANCE_RULE`, `SEARCH_INTENT_SCHEMA`, `VISUAL_SEARCH_INTENT_SCHEMA`.
- `agent-memory-context.ts`, `search-agent.ts`, `seller-voice-prompt.ts`, `browse-all-agent-rules.ts`, `description-personas.ts`, `secretary-persona.ts`, `proactive-nudges.ts`, `prompters/system-handbook.ts`.

### 1.3 Capability/tool routing
- `server/src/ai/agent-tools.ts` — `AGENT_FUNCTION_DECLARATIONS` (searchListings, applyFilter, clearAllFilters, create_listing_draft, updateListingDraft, triggerMicroPayment, markListingSold, postNewListing, createUserRequirement, proposeSmartBargaining…) + `executeAgentTool`.
- `server/src/ai/supervisor-tool-runner.ts` — `shouldForceSupervisorTools` deterministic pre-Gemini gate; `runDeterministicSupervisorSearch` (NLP → SQL, no Gemini ping-pong); `sideEffectPriority` (search 70 < listing_draft 90 < browse_all 95).
- `shared/intents/` — browse-all, sell, job-seeker, photo-search/photo-sell, publish-confirmation intents.
- `server/src/routes/vauto-agent.ts` — HTTP + auth routing.

### 1.4 Context/state management
- `shared/llm-context-slice.ts` — `slimListingDraftForLlm`, `slimDocumentFactsForLlm`, `slimImageHandleList`.
- `server/src/ai/agent-request-trim.ts` — `AGENT_MAX_MESSAGES`, `AGENT_MAX_MESSAGE_CHARS`, `AGENT_MAX_LISTINGS`, `AGENT_MAX_PENDING_DOCUMENT_TEXT_CHARS`.
- `server/src/ai/agent-session-memory.ts` — `AGENT_SESSION_MESSAGE_LIMIT = 8`.
- Client `.slice(-6)` history trim; `agent-busy-gate` queue.

### 1.5 Legacy/conflicting prompt layers
`@deprecated` in `server/src/ai/`: `vauto-unified.buildImagePrompt` (prefer extraction + creative two-pass), `listing-draft-preview`, `bargain-twin` (→ `runAutoNegotiation`), `listing-gallery-roles`, `monetization-engine`, `cloudinary`, `prompters/system-handbook` stubs, `document-text-extract` legacy `.doc`, `supervisor-tool-runner` `legacy.functionCall` handling. In `src/lib/`: ~30 deprecated modules (chameleon/portal/vertical-presentation/native-media/agent-flow-wizard/vauto-agent-client/monetization-wardrobe…). All are doc-only deprecation; **no test asserts they are not loaded**.

### 1.6 Search interpretation
- `src/lib/ai-facet-interpretation.ts` — `interpretAiFacets(query)` → `FacetChip[]` (vertical, location, price, condition, radius, keyword, attribute).
- `src/lib/apply-ai-facet.ts` — `applyFacetChips`, `applyAiFacet`, `removeAiFacet`.
- `src/components/marketplace/AiInterpretationChips.tsx` — editable/removable AI chips (label aligned to „VAUTO suprato tavo užklausą").
- Server: `search-intent.ts` (`analyzeSearchIntent`), `product-search-query.ts`, `universal-search-intent.ts`.

### 1.7 Listing generation
- `server/src/ai/vauto-agent.ts` — states `DRAFTING_TEXT → AWAITING_PHOTOS → DRAFT_READY → AWAITING_CONFIRMATION`; **`postNewListing`/DB publish never called directly** — user confirms in a modal.
- `shared/ensure-rich-sales-copy.ts` — `MIN_RICH_SALES_COPY_CHARS`, `ensureRichSalesCopyBeforePublish`.
- `shared/vehicle-sales-copy.ts` — fuel labels, confirm intents.
- `src/components/home/PrePublishListingCard.tsx` — manual publish button (`submitPublish`).
- `src/context/SellerFlowContext.tsx` — `publishListing` gated by `showConfirm` (price sanity).
- `server/src/ai/sell/sell-draft-schema.ts` — `requiresUserConfirmation: z.literal(true)`, `autoPublish: z.literal(false)`.

### 1.8 Image/document input handling
- `server/src/services/visual-pipeline/` — `orchestrator.ts` (`runVisualPipeline`: OCR + damage parallel, background removal, smart-sort) + `providers/` (`ocr.ts`, `damage-detection.ts`, `background-removal.ts`, `smart-sort.ts`, `vision-extract.ts`).
- `server/src/ai/vision-multi-object.ts` — `DetectedVisionObject`, multi-object clarification chips.
- `server/src/ai/vision-guardrails.ts` — Pass-1 extraction (facts/OCR/category) vs Pass-2 creative sales copy.
- `server/src/ai/document-text-extract.ts` — `extractPendingChatDocuments`, `mergeDocumentFactsIntoAttributes`.
- Client: `src/lib/chat-photo-upload-flow.ts`, `src/lib/prepare-chat-images-for-agent.ts`, `src/lib/chat-document-extract.ts`.

### 1.9 Canonical vertical schemas
- `shared/marketplace-domain/registry.ts` — `CANONICAL_VERTICALS` (6 verticals with `attributes`, `capabilities`, `listingKind`).
- `shared/category-registry.ts`, `shared/listing-photo-policy.ts` (photo limits per category, `VISION_UPLOAD_BATCH_SIZE`), `shared/vision-object-labels.ts`.

### 1.10 Human confirmation boundaries
- Publish: manual-only (PrePublish card click; `sell-draft-schema` literal-true confirmation; `vauto-agent.ts` never publishes directly).
- Price: written into draft only if user stated it (`VISION_MASTER_SALES_COPYWRITER_RULE`).
- Deal: `universal-deal-room-service.ts` — offer/accept/reject actor-scoped, idempotency-key + expected-version concurrency; "AI is optional and never required".
- Payment: `triggerMicroPayment` + `ZeroUiPaymentGate` require explicit "Taip, apmokėti".

### 1.11 AI-down fallback
- `server/src/ai/llm-provider.ts` — `isGeminiQuotaExhaustedError`, `callGeminiWithRetry`, `failFastOnQuota`, `resolveTextFallbackPayload`.
- `src/lib/ai-timeout-policy.ts` — `AI_TIMEOUT_POLICY` (search SQL 8s, agent 120s, vision fetch 120s, stream vision 180s).
- `src/lib/brutal-voice-fallback.ts` — HTML5 TTS when AI unavailable.
- Deterministic no-LLM paths: `runDeterministicSupervisorSearch`, `buildSellListingDraftFallback`, `commitVisionObjectSellToPrePublish`.
- E2E: `stage17-ai-failure-independence.spec.ts`, `ai-assistant-restore.spec.ts`.

### 1.12 Model/provider abstraction
- `server/src/ai/foundation/model-router.ts` — `AiTaskClass` (FAST/VISION/REASONING/FALLBACK), `AiProviderId` (gemini/openai/anthropic), `resolveAiModel` + `fallbackUsed`; env `AI_MODEL_FAST/VISION/REASONING/FALLBACK`.
- `server/src/ai/llm-provider.ts` — `UNIFIED_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]`, retry chain, `resolveGeminiApiKey` (`GEMINI_API_KEY` || `AI_KEY` || `GOOGLE_AI_API_KEY`).
- Note: openai/anthropic exist as router IDs but have no working call paths — Gemini is the effective provider.

### 1.13 Existing AI tests
- Unit: `ai-native-flow-18.2.test.ts`, `ai-facet-interpretation.test.ts`, `ai-vertical-adapter.test.ts`, `server full-red-team.test.ts` (300+ cases), `intent-engine.test.ts`, `nl-search.test.ts`, `visual-sell.test.ts`, `stage10-*`.
- E2E: `ai-conductor*.spec.ts`, `stage18-ai-native.spec.ts`, `stage182-ai-native-flow.spec.ts`, `stage183-search-state.spec.ts`, `stage17-ai-failure-independence.spec.ts`, `ai-assistant-restore.spec.ts`, `prepublish-live.spec.ts`, `prepublish-modal-smoke.spec.ts`, `stage13c-deal-room.spec.ts`.

---

## 2. Mandatory AI Maturity Block — Minimum Implementation Plan

### A. AI Assistant Behavioral Resilience & Autonomy

| Test area | Current coverage | Minimum plan |
|---|---|---|
| Instruction overload | PARTIAL (`full-red-team` poisoning/injection) | Add focused unit tests for multi-layer prompt stacking (supervisor + intent + guardrails + memory) under maximum length |
| Conflicting prompts | GAP | Unit test asserting Pass-1 extraction vs Pass-2 copywriter rules resolve deterministically (no copy in Pass-1, no facts invented in Pass-2) |
| Legacy prompt contamination | GAP | Unit test asserting deprecated modules/prompts are not loaded into active instruction; add a guard that fails if a `@deprecated` builder is imported by active path |
| Long conversations | PARTIAL (constants exist) | E2E stress: 50-turn conversation, assert trim/queue caps hold and state stays coherent |
| Tool routing | EXISTS | Keep; extend for new intent/tool pairs |
| Error recovery | EXISTS | Keep; add one quota-exhaustion → deterministic-search fallback unit test |
| Initiative vs unnecessary interruption | PARTIAL (`proactive-nudges.ts`) | Unit test: nudge only fires on allowed conditions; never auto-executes consequential tool |
| Capability limits | EXISTS | Keep |
| Human-control boundaries | EXISTS | Keep; add explicit "no publish without click" assertion in prepublish E2E |
| Context preservation | PARTIAL (`stage183` URL persistence) | Add unit test for `slimListingDraftForLlm` round-trip (no field loss) |

### B. Multimodal Listing Intelligence & Generation

| Area | Current coverage | Minimum plan |
|---|---|---|
| Photos | EXISTS (`visual-pipeline`, two-pass) | Keep |
| Documents | EXISTS (`document-text-extract`) | Keep; assert document facts merge into attributes |
| Labels | EXISTS (`vision-multi-object`) | Keep |
| User text | EXISTS (merge paths) | Keep; assert text overrides/supplements vision |
| Existing fields | PARTIAL (anti-stale-title) | Unit test: existing draft fields are respected/merged |
| Canonical schema | EXISTS | Keep; assert draft validates against `VERTICAL_ATTRIBUTES` |
| **Fact/confidence/uncertainty separation** | **GAP** | Add `provenance`, `confidence`, `uncertainty`, `missingFields[]`, `conflicts[]` to the draft contract; unit-test separation invariants |
| **Conflict detection** | **GAP** | Add conflict list (OCR vs vision vs user text); unit-test surfacing |
| Missing-data detection | PARTIAL (`evaluatePrePublishReadiness`) | Keep; surface missing fields in draft UI |
| Category-adapted description policy | EXISTS | Keep |
| Quality suggestions | PARTIAL (rich-copy enforcement) | Surface suggestions (vs silent enforcement) in draft review |
| Human review before publish | EXISTS | Keep; assert publish stays manual |

---

## 3. Recommended Single AI-Foundation Improvement (Task 9 candidate)

**Canonical listing-draft interface** — a single shared typed draft contract:
`provenance: "ocr" | "vision" | "user_text" | "document" | "agent"`, `confidence`, `uncertainty`, `missingFields[]`, `conflicts[]` — consumed by every layer.

Evidence it is the highest-confidence bounded choice:
- All supporting modules already exist and are concrete extension points: `shared/llm-context-slice.ts` (`slimListingDraftForLlm`), `shared/ensure-rich-sales-copy.ts`, `server/src/ai/sell/sell-draft-schema.ts` (zod), `server/src/ai/vauto-agent.ts` (`normalizeListingDraftForAction`, `mergeDocumentFactsIntoAttributes`), `server/src/ai/document-text-extract.ts`, `server/src/ai/vision-multi-object.ts`, `src/lib/pre-publish-validation.ts`, `src/components/home/PrePublishListingCard.tsx`.
- Directly fills the two named GAPs (fact/confidence/uncertainty separation, conflict detection) as a pure-data change — no new model/provider risk.
- Testable with existing harnesses (`visual-sell.test.ts`, `ai-native-flow-18.2.test.ts`, `prepublish-live.spec.ts`); deterministic, no network.

Runner-up: **non-consequential confirmation boundary** (formalize `showConfirm`/`requiresUserConfirmation` into a shared typed boundary) — ~90% implemented, but the draft contract is the stronger single lever.
