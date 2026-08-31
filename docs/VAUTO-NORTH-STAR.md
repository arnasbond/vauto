# VAUTO North Star

> **Status:** This document is the authoritative product and AI behavior direction for VAUTO.
> It does **not** override frozen security/financial boundaries or a specifically authorized stage contract.
>
> **Authority hierarchy (highest first):**
> 1. Frozen security, financial and transaction boundaries (incl. Stage 11);
> 2. A specifically authorized stage/task contract;
> 3. This VAUTO North Star;
> 4. Agent initiative.
>
> Agents are disciplined implementers, **not autonomous product directors**.

---

## 1. Product identity

- VAUTO is **one universal AI-native marketplace**.
- VAUTO is **not an automotive marketplace**.
- The name “VAUTO” does **not** make transport the priority or default.
- VAUTO is **not** a traditional portal with a chatbot attached.

Core promise:

> **„Pasakyk arba parodyk, ko nori. VAUTO padės padaryti visa kita.“**

## 2. Equal verticals

VAUTO serves equal platform verticals:

- **real estate** (nekilnojamas turtas);
- **electronics** (elektronika);
- **clothing / fashion and general goods** (mada ir apranga / prekės);
- **services** (paslaugos);
- **jobs** (darbas);
- **transport** (transportas);
- **future categories**.

Rules:

- **No vertical is the default.** Transport is one equal capability domain.
- Verticals differ **only** through: canonical schemas, attributes, capabilities, information-density policies and category-specific workflows.
- Verticals must **never** split into separate product identities, duplicated platform architecture or unrelated themes.

## 3. Human-control law

- **AI helps; the human decides.**
- Consequential, irreversible or externally meaningful actions require **explicit human confirmation** through a real UI control.
- A plain “yes” in chat, inferred intent or model confidence is **not authority**.
- Server-owned verification remains the source of truth where applicable (e.g. VIN receipts, consequential-action confirmation, payment/deal authorization).
- AI may understand, structure, recommend and prepare.
- AI may **not** silently publish, pay, moderate, block, sell, finalize or otherwise complete consequential actions.

## 4. AI-down law

- **AI DOWN ≠ VAUTO DOWN.**
- Categories, classical search, filters, manual listing creation and all deterministic marketplace capabilities must remain usable without the AI.
- AI failure must degrade gracefully — never block the product, never lock the UI, never invent data as a fallback.

## 5. Unified marketplace core

Natural language, photographs, documents/labels and classical search must **converge on the same canonical marketplace data and search core**.

Do **not** create:

- separate AI-only listings;
- separate chatbot truth;
- duplicate publish authority or second publish paths as product direction;
- category-specific platform forks.

## 6. Fact, inference and uncertainty contract

Definitions:

| Term | Meaning |
|---|---|
| **Fact** | A value whose source has been verified or canonically recorded (e.g. server-verified VIN, persisted listing field). |
| **User-provided claim** | What the user typed/said — trusted as input, but still subject to canonical shaping and, where critical, confirmation. |
| **Document/label observation** | Content read from a document, label or barcode — an observation, not automatically canonical. |
| **Visual inference** | What the model inferred from photos — always provisional until accepted by the user or a deterministic rule. |
| **Confidence** | A numeric/level signal attached to an inference; never authority by itself. |
| **Uncertainty** | A known state of not knowing — must be visible to the user, not hidden. |
| **Conflict** | Two sources disagree on the same field — must be surfaced as a choice, never silently resolved. |
| **Canonical value** | The value stored in the listing record through the verified pipeline. |
| **Human-confirmed value** | A canonical value explicitly confirmed by the human (e.g. through the VIN review / PrePublish flow). |

Rules:

- AI **never invents** missing facts.
- Interpretation must **never silently become fact**.
- Conflicting sources must be **surfaced**.
- Human-confirmed facts must **not be silently overwritten**.
- If the system cannot determine something reliably, it must **say so**.
- Provenance/confidence architecture must be **shared across verticals** — not rebuilt only for transport.

## 7. Multimodal listing doctrine

Canonical pipeline:

```
photos + documents/labels + user text + existing fields
  → category/object understanding
  → canonical attributes
  → provenance
  → confidence/uncertainty
  → conflict detection
  → missing important information
  → vertical-specific strategy
  → minimum useful description
  → human review/editing
  → confirmation
  → publication
```

> VAUTO must not demonstrate how much AI can write. **VAUTO must demonstrate how little the user needs to do.**

## 8. Assistant behavior — Atlas standard

The target assistant:

- understands the user’s **actual goal**;
- uses **existing context** — never repeatedly asks already-answered questions;
- asks **one highest-value question** when a question is needed;
- shows useful initiative **without taking authority**;
- selects tools intelligently and avoids unnecessary tool calls;
- distinguishes **knowledge from uncertainty**;
- recovers after tool/model failure;
- handles long and conflicting context gracefully;
- remains concise and category-appropriate;
- explains **what it understood, what is uncertain, and what it can do next**.

> “Atlas-like” maturity is **not** achieved merely because APIs and tests respond. It is measured by whether a person feels: „VAUTO suprato, ko aš noriu, ir padėjo man tai padaryti.“

## 9. Vertical-specific information density

Balanced expectations (no vertical gets more doctrinal weight than another):

- **Real estate:** factual parameters (type, area, rooms, year, floor, heating) plus clearly separated space/condition interpretation.
- **Electronics:** model, configuration, storage, condition, battery/warranty uncertainty.
- **Clothing:** label data, size, material, color, visible condition; concise description.
- **Services:** service, location, availability, pricing model, experience.
- **Jobs:** responsibilities, requirements, salary, work conditions.
- **Transport:** technical attributes and **verified** VIN/document handling.

## 10. Radical simplicity and progressive disclosure

- Ask only what materially improves the next decision.
- Do not overwhelm users with fields or generated prose.
- Contextual assistance is preferred over one giant chat interface.
- Expected interaction pattern:

```
„Štai ką supratau“
  → „štai kas neaišku“
  → „štai ką galiu padaryti“
  → human correction / confirmation
```

## 11. Visual North Star

- The first-approved **MASTER LIGHT** and **MASTER DARK** references remain the visual Source of Truth.
- Same structure, hierarchy, spacing and radii across themes.
- Emerald used meaningfully and sparingly.
- Premium, calm and clean.
- DARK is **not** a separate redesign.
- No generic purple/blue AI-gradient direction.
- No unnecessary glassmorphism.
- LIGHT requires subtle depth, borders and shadows.
- No new redesign may silently replace the approved references.

## 12. Architecture and agent guardrails

- **Deterministic core before LLM improvisation.**
- **Canonical schemas before prompt-specific field lists.**
- **Shared cross-vertical contracts before duplicated vertical logic.**
- **Stage 11 remains protected** (frozen boundary).
- No prompt stacking as a substitute for architecture.
- No dead/legacy imitation code as product direction.
- No server→client coupling expansion.
- Tests must protect **user behavior**, not merely the current DOM shape.

## 13. Completion question

The project control question, asked after any change:

> **„Ar po kelių veiksmų žmogus jaučia: „VAUTO suprato, ko aš noriu, ir padėjo man tai padaryti“?“**

If not — the product has not reached the intended VAUTO, regardless of green tests or visual polish.
