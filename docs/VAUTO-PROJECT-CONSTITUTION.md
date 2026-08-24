# VAUTO Project Constitution

Source of truth for VAUTO product doctrine. Read this before any major VAUTO work (feature, theme, AI).

## Core Vision

VAUTO is an **AI-native universal marketplace** — not a car portal, and not a marketplace with a separate chatbot.

- Core promise: „Pasakyk, ko nori. VAUTO padės padaryti visa kita." / „Marketplace, su kuriuo galima tiesiog susikalbėti."
- The marketplace itself becomes the assistant.
- AI helps; the human decides.
- Natural language, photos, documents, labels and entered data become editable structured marketplace information.
- Classic categories, filters, sorting, map and manual listing creation always remain available.
- **AI DOWN must not mean VAUTO DOWN.**

## VAUTO Assistant Lens

For every important user flow, reason:

1. What does the assistant know here?
2. What does it understand?
3. What useful action could it take?
4. What information is missing?
5. What can it safely do autonomously?
6. What requires human confirmation?
7. Does the current architecture allow this naturally?

## AI Behavior

- AI is proactive where useful, but **never silently performs consequential or irreversible actions**.
- Publishing a listing, materially changing price, accepting a deal, payment, destructive actions → require appropriate human confirmation.
- Intelligence is NOT measured by verbosity. Often the best behavior is one sentence, one useful suggestion, structured fields, or no interruption at all.
- Never hallucinate marketplace facts. Separate **fact, inference, uncertainty, recommendation**.
- When sources conflict, surface the conflict instead of silently choosing.

## Multimodal Listing Intelligence

Pipeline: photos + documents/labels + user text + entered fields → object/category understanding → canonical structured attributes → confidence/uncertainty → missing important data → category-adapted listing strategy → concise useful listing content → user review/edit → **publish only after confirmation**.

Vertical behavior adapts:

- transport: factual / technical / condition-specific;
- electronics: model, configuration, condition, accessories, relevant performance details;
- fashion: concise, visual, size/material/condition oriented;
- real estate: factual structured attributes + careful interpretation of visible space;
- services: what is done, where, timing, experience/capability;
- jobs: role, responsibilities, requirements, compensation/conditions where available;
- goods/home/etc: only decision-useful information.

Core rule: **generate the minimum amount of information necessary for a buyer to make the next decision confidently.**

## Design System

- One unified **VAUTO Design System 2.0** (`src/design-system/`, `--ds-*` tokens).
- MASTER LIGHT + faithful MASTER DARK counterpart.
- **Emerald** is the distinctive accent.
- No external portal imitation.
- Chameleon / Autoplius / Aruodas / Skelbiu / Vinted simulator concepts are **deprecated legacy**, not product direction.
- Different verticals differ through data, workflows and capabilities — not unrelated visual identities.
- Avoid generic AI template appearance: no purple/blue AI gradients, no excessive glow, no glassmorphism overload, no pill overload, no decorative "AI for AI's sake".
- Calm / premium / trustworthy. Rough balance: **80% calm product UI, 15% typography/photography/content, 5% VAUTO/AI magic**.
- Light and dark preserve identical hierarchy, spacing, component logic and interaction. Light retains subtle premium depth.
- Responsive targets: ~1920, 1440, 768, 390 widths. Foldable/viewport continuity stays robust.

## Master Theme Reference

Approved visual source of truth: `docs/design-reference/chatgpt-visual-baseline/VAUTO-MASTER-LIGHT.jpg` + `VAUTO-MASTER-DARK.jpg` (immutable reference evidence; see `VISUAL-REFERENCE-POLICY.md`). The first VAUTO concept containing:

- large hero: „Pasakyk, ko nori. VAUTO padės padaryti visa kita.";
- large natural-language search input;
- suggested query examples;
- category cards with image/object imagery;
- „VAUTO suprato tavo užklausą" structured interpretation block;
- editable recognized parameters/facets;
- listing result preview beside/below structured intent;
- clean premium LIGHT + faithful DARK;
- emerald emphasis;
- category-rich marketplace homepage.

Reference is intent, not pixel copy. Reference files are design evidence only — never import into `public/`, `src/assets/`, or the production bundle.

## Human-in-the-Loop

„AI padeda. Žmogus sprendžia."

AI may prepare, explain, structure and recommend. Human approval remains required for consequential actions.

## Frozen Boundary

Stage 11 transaction/payment/ledger/webhook/financial obligation/authorization-trust logic is **protected** and must not be modified unless an explicitly authorized future Stage 11 task exists.
