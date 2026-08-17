# Stage 15R.2 — Render Docker build root-cause remediation

**Cursor status:** recorded in `vauto-15r2-delta.zip` after GitHub CI.

Stage 15 remains **NO-GO**. Production Vercel/Render/DB were **not** deployed. Stage 16 was **not** started. Force-push / force-deploy were **not** used. Stage 10–14 product semantics, payments/ledger/Stripe, migrations, and UI/UX were **not** changed.

---

## Proven MODULE_NOT_FOUND

Render `dockerContext` is `./server`. Builder `WORKDIR /app` then `RUN npm run build`.

`server/package.json` (pre-fix) `"build": "node ../scripts/sync-marketplace-domain.mjs && tsc"`.

That parent path is **outside** the Docker context. Reproduction with only the files Dockerfile `COPY`s (no `../scripts`):

```
Error: Cannot find module '…/scripts/sync-marketplace-domain.mjs'
code: 'MODULE_NOT_FOUND'
```

On Linux/Render that path is `/scripts/sync-marketplace-domain.mjs`.

`tsc` then never runs. The sync script also needs repo-root `shared/marketplace-domain`, equally outside `./server`.

Committed `server/src/shared/marketplace-domain/*` already contains the synced sources. In the same server-only tree, `npx tsc` **exit 0** and emits `dist/index.js` + `dist/shared/marketplace-domain/index.js`.

No `.dockerignore` existed. Builder `npm ci` includes `devDependencies` (`@tsconfig/node22`). Runtime stage still `npm ci --omit=dev`.

**Not** used: `COPY . .`, dockerContext widening, production dependency changes.

---

## Minimal fix

`server/scripts/run-marketplace-domain-sync.mjs` (in context): if `../../scripts/sync-marketplace-domain.mjs` exists, run it (local/CI); else skip and compile committed `src/shared/marketplace-domain`.

`build` becomes `node ./scripts/run-marketplace-domain-sync.mjs && tsc`. Dockerfile still `RUN npm run build` and still `dockerContext: ./server`.
