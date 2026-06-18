# Vauto

Lietuviška AI-first skelbimų platforma — PWA ir Android aplikacija.

**Live:** https://vauto-chi.vercel.app  
**APK:** https://vauto-chi.vercel.app/install/

## Greitas startas (tik frontend)

```bash
npm install
npm run dev
```

Atidarykite http://localhost:3000. Duomenys saugomi naršyklės `localStorage`. AI veikia per Vercel serverį (jei `OPENAI_API_KEY` sukonfigūruotas).

## Pilnas stack (frontend + API + PostgreSQL)

```bash
# 1. Duomenų bazė + API (Docker)
docker compose up -d

# 2. Užpildyti demo duomenis
npm run db:seed

# 3. Frontend su API
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
npm run dev
```

Arba API be Docker build:

```bash
npm run db:up          # tik PostgreSQL
npm run server:install
npm run server:dev     # Express :4000
```

## Android APK

```bash
npm run apk
# Rezultatas: dist/vauto-debug.apk
```

Reikia: `ANDROID_HOME`, `JAVA_HOME`, Android SDK.

## Aplinkos kintamieji

| Kintamasis | Kur | Paskirtis |
|------------|-----|-----------|
| `OPENAI_API_KEY` | Vercel / server | Serverio AI (rekomenduojama produkcijai) |
| `NEXT_PUBLIC_API_URL` | `.env.local` | Express backend URL |
| `DATABASE_URL` | `server/.env` | PostgreSQL connection string |
| `NEXT_PUBLIC_OPENAI_API_KEY` | `.env.local` | Tik lokaliai (nebūtina) |

Žr. `.env.example`.

## Deploy

### Vercel (frontend + AI proxy)

- GitHub repo prijungtas prie Vercel
- `OPENAI_API_KEY` → Vercel Environment Variables
- AI endpointai: `/api/ai/health`, `/api/ai/extract-text`, `/api/ai/extract-image`

### Express API (Railway / Render / VPS)

```bash
cd server
docker build -t vauto-api .
docker run -p 4000:4000 \
  -e DATABASE_URL=postgresql://... \
  -e OPENAI_API_KEY=sk-... \
  vauto-api
```

Arba `docker compose up -d` (db + api kartu).

**Render (1-click):** prijunkite repo → New Blueprint → `render.yaml` → įveskite `OPENAI_API_KEY` → po deploy nustatykite Vercel `NEXT_PUBLIC_API_URL` į Render API URL.

### Escrow (saugus mokėjimas)

Pokalbyje parašykite „perku" arba „tinka" — atsiras escrow blokas. Būsena saugoma `localStorage` arba PostgreSQL (`escrow_transactions`).

## Struktūra

```
vauto/
├── src/           # Next.js app (static export)
├── api/ai/        # Vercel serverless AI proxy
├── server/        # Express + PostgreSQL API
├── database/      # schema-lite.sql (dabartinis), schema.sql (ateitis)
├── android/       # Capacitor Android
└── out/           # Static build output
```

## AI režimai

1. **Serverio AI** — Vercel `OPENAI_API_KEY` (numatytasis produkcijoje)
2. **Asmeninis raktas** — profilyje → AI nustatymai
3. **Demo** — mock duomenys, jei AI nepasiekiamas

Patikrinti: Profilis → „Testuoti AI“.
