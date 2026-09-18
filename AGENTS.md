# AGENTS.md

## Cursor Cloud specific instructions

Vauto is a Lithuanian AI-first classified-ads platform. Two services matter for local dev:

- **Frontend** — Next.js 15 / React 19 PWA (`src/`). Works standalone using browser `localStorage` ("demo mode"), so it runs without the backend. Static export (`output: "export"`).
- **Backend API** (optional) — Express + PostgreSQL on port `4000` (`server/`). Gracefully degrades when PostgreSQL is unavailable (the frontend just stays in demo mode). When `NEXT_PUBLIC_API_URL` is set, the frontend syncs listings/reports/etc. with it.

Standard commands live in `package.json` (root) and `server/package.json`. See `README.md` for the full feature/deploy reference.

### Running the services

- Frontend dev: `npm run dev` (http://localhost:3000). To connect it to the local API, `.env.local` must contain `NEXT_PUBLIC_API_URL=http://localhost:4000` (already created during setup; recreate it if missing).
- Backend dev: `npm run server:dev` (tsx watch, http://localhost:4000). Reads `server/.env` (`DATABASE_URL`, `PORT`). On startup it auto-runs migrations (`server/migrations/`) and seeds demo data if the DB is empty — no manual migrate/seed step needed.

### PostgreSQL (required only for the backend API)

There is no Docker in this environment, so the backend uses a **native** PostgreSQL 16 install instead of `docker compose up`. The cluster does NOT auto-start on boot — start it before running the API:

```bash
sudo pg_ctlcluster 16 main start
```

DB/role expected by the default connection string (`postgresql://vauto:vauto@localhost:5432/vauto`): role `vauto` / password `vauto`, database `vauto`. The migrations only need the built-in `pgcrypto` extension (the `pgvector` image in `docker-compose.yml` is not required here).

### Lint / test / build

- Lint: `npm run lint`
- Build (static export → `out/`): `npm run build`; server build: `npm run server:build`
- E2E (Playwright smoke): `CI=true npx playwright test`. Run with `CI=true` so it uses the bundled chromium (the default local config requests `channel: chrome`, which is not installed). The Playwright `webServer` builds/serves the static `out/` dir on port 4173 itself.

### Notes / gotchas

- The Android/Capacitor build (`npm run apk`) is Windows/PowerShell only and not runnable here.
- AI endpoints return `{"mode":"demo"}` unless `OPENAI_API_KEY` is configured — expected; AI features fall back to mock data.
- Admin login: use `admin@vauto.com` with any password in demo mode to access the Vauto Control Center.
