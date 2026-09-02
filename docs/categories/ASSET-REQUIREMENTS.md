# F7 Premium Category Imagery — ASSET REQUIREMENTS (Atlas asset generation)

Status: **FULFILLED** — Atlas delivered the three photorealistic sources
(1254×1254, white studio background, realistic materials and contact
shadows). They were deterministically normalized to 1024×1024
(`scripts/normalize-category-sources.mjs`) and processed through the
existing keying pipeline (`scripts/process-category-images.mjs`, now
including the three new files). Optical-size audit passes:
clothing 0.468 · jobs 0.767 · other 0.605 vs existing median 0.452
(`node scripts/check-category-optical-size.mjs` → exit 0).

Reference / style baseline:
`H:\OneDrive\Desktop\VAUTO-MASTERS-VISUALS\VAUTPO-MASTER-NEW UPDATE.jpg`
(owner-approved master).

## Required deliverables (one per category)

| File (exact path) | Object |
|---|---|
| `assets/categories-source/category-clothing.png` | **Mada** — cream knit cardigan on a NATURAL WOOD hanger: clearly visible sleeves, body, hanger, buttons and a subtle knit texture. Realistic premium product photography, NOT an icon. |
| `assets/categories-source/category-jobs.png` | **Darbas** — wide, STRUCTURED dark-brown leather document portfolio in THREE-QUARTER perspective (not a flat front rectangle): clear handle, flap, stitching, brass clasp and subtle leather texture. |
| `assets/categories-source/category-other.png` | **Kita** — clearly recognizable CLOSED kraft-cardboard shipping box in THREE-QUARTER perspective: visible walls, top flaps and adhesive tape, natural kraft texture, no logos/marks. |

## Source contract (must match the five existing sources)

1. 1024×1024 PNG, object isolated on a PLAIN STUDIO-WHITE background.
2. Soft contact shadow that TOUCHES (or is immediately adjacent to) the object.
3. Object centered; no clipping; safe margins matching the existing six.
4. No text, logos, people, scene, room, green card background or gradient backdrop.
5. Readable in LIGHT and DARK card themes.
6. Optical fill ratio (non-transparent pixels after keying) must land within
   ±0.15 of the existing median (~0.45): current stand-ins measure ~0.19–0.23
   and FAIL (`node scripts/check-category-optical-size.mjs`).

## Pipeline (already wired, no code changes needed)

1. Drop the three PNGs into `assets/categories-source/`.
2. Add their names to `CATEGORY_IMAGE_FILES` in `scripts/process-category-images.mjs`
   (background flood-fill keying + feathered alpha) OR keep the direct-alpha
   triplet generator `scripts/generate-category-illustrations.mjs` (replace its
   SVG bodies with the raster sources).
3. Served triplet per category (already referenced by `CATEGORY_IMAGE_SRC`):
   - `public/images/categories/category-<name>.png` (480px)
   - `public/images/categories/category-<name>.webp` (240px)
   - `public/images/categories/category-<name>@2x.webp` (480px)

## Acceptance checks (run after generation)

- `node scripts/check-category-optical-size.mjs` → PASS (exit 0).
- `npx tsx --test src/lib/__tests__/f7-premium-imagery.test.ts` → PASS.
- `npx playwright test tests/e2e/f7-category-cards.spec.ts --project=e2e-enterprise` → PASS.
- Contact sheets (light + dark, REAL tile scale) regenerated and re-reviewed.

## Explicitly out of scope for this branch

Category semantics, names/order, filters, search, card geometry, branding,
Stage 11, payments, ledger, webhooks, AI, F6, migrations, deploy.
