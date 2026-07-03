# PROJECT_TREE.md
Max depth 4. Excludes: `node_modules`, `.next`, `out`, `.git`, `test-results`, `dist`.

```
vauto/
  .github/
  .vercel/
  android/
  audit-pack/
  database/
  docs/
  e2e/
    helpers/
      seed-demo-user.ts
    smoke.spec.ts
  ios/
  public/
    runtime-config.json
    manifest.json
  scripts/
    *.mjs (build, verify, provision, audit)
    build-apk.ps1
  server/
    Dockerfile
    migrations/
      000_schema_migrations.sql
      001_*.sql … 020_*.sql
    scripts/
    src/
      ai/
      auth/
      billing/
      controllers/
      middleware/
      push/
      reports/
      routes/
        api.ts, auth.ts, ai.ts, billing.ts, escrow-billing.ts
        growth.ts, push.ts, shipping.ts, spinta.ts, search.ts
        vauto-agent.ts, vauto-server.ts
      services/
      shipping/
      spinta/
      test/
      vehicle/
      index.ts
      repository.ts
      env-check.ts
      validation.ts
  src/
    app/
      add/, admin/, auth/, chats/, discover/, fashion/
      install/, listing/, messages/, profile/, search/
      seller/, apie/, taisykles/, privatumas/, …
    components/
      admin/, auth/, dashboard/, home/, marketplace/
      profile/, status/, …
    context/
      AppProviders.tsx, AuthContext.tsx, VautoContext.tsx, …
    data/
      mockListings.ts, lithuania-mock-catalog.ts
    lib/
      api/, auth/, payments/, shipping/
      gemini-browser.ts, ai-mocks.ts, demo-catalog.ts
      b2b-plans.ts, monetization-engine.ts
    hooks/
  _later/
    ios-testflight/
  capacitor.config.ts
  docker-compose.yml
  next.config.ts
  package.json
  playwright.config.ts
  playwright.prod.config.ts
  render.yaml
  vercel.json
  TECH-AUDIT-2026-06-28.txt
```

## Key file counts (approximate)
| Area | Files |
|------|-------|
| `src/app` pages | ~27 routes |
| `src/components` | 100+ components |
| `src/context` | 18 providers |
| `server/src/routes` | 12 routers |
| `server/migrations` | 21 SQL files |
| `e2e` | 1 spec, 21 tests |
