# VAUTO

Lietuviška AI-first skelbimų platforma — PWA ir Android aplikacija.

**Live:** https://www.vauto.lt  
**APK:** https://www.vauto.lt/install/

## Greitas startas (tik frontend)

```bash
npm install
npm run dev
```

Atidarykite http://localhost:3000. Duomenys saugomi naršyklės `localStorage`. AI veikia per Vercel/Render serverį (jei `GEMINI_API_KEY` sukonfigūruotas).

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
| `GEMINI_API_KEY` | Vercel / Render / server | Serverio AI (Gemini, rekomenduojama produkcijai) |
| `AI_KEY` | Vercel / Render / server | Alternatyvus Gemini raktas |
| `NEXT_PUBLIC_API_URL` | `.env.local` | Express backend URL |
| `DATABASE_URL` | `server/.env` | PostgreSQL connection string |

Žr. `.env.example`.

## Deploy

### Vercel (frontend + AI proxy)

- GitHub repo prijungtas prie Vercel
- `GEMINI_API_KEY` → Vercel Environment Variables
- AI endpointai: `/api/ai/health`, `/api/ai/extract-text`, `/api/ai/extract-image`, `/api/vauto-agent`

### Express API (Railway / Render / VPS)

```bash
cd server
docker build -t vauto-api .
docker run -p 4000:4000 \
  -e DATABASE_URL=postgresql://... \
  -e GEMINI_API_KEY=your-gemini-key \
  vauto-api
```

Arba `docker compose up -d` (db + api kartu).

**Render (1-click):** prijunkite repo → New Blueprint → `render.yaml` → įveskite `GEMINI_API_KEY` → po deploy nustatykite Vercel `NEXT_PUBLIC_API_URL` į Render API URL.

**Automatinis Render (API raktas):**

```bash
# 1. Render Dashboard → Account Settings → API Keys
gh secret set RENDER_API_KEY -R arnasbond/vauto
gh secret set GEMINI_API_KEY -R arnasbond/vauto

# 2. GitHub Actions → Provision Render API → Run workflow
# arba lokaliai:
RENDER_API_KEY=rnd_xxx npm run provision:render
```

`vercel.json` ir `public/runtime-config.json` jau nurodo `https://vauto-api.onrender.com` — Vercel perbuildina automatiškai push metu.

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

1. **Serverio AI** — Vercel/Render `GEMINI_API_KEY` (numatytasis produkcijoje)
2. **Demo** — mock duomenys, jei Gemini nepasiekiamas

Patikrinti: Profilis → „Testuoti Gemini“.

## Admin ir moderacija

- Prisijunkite kaip **admin@vauto.com** (bet koks slaptažodis demo režime)
- Profilyje atsiras **VAUTO Control Center** (arba apačioje **VAUTO CC**)
- Peržiūrėkite pranešimus, įspėkite, užblokuokite arba uždarykite ticketus
- Skelbimuose ir pokalbiuose — **Pranešti apie pažeidimą**

## Pasitikėjimas ir saugumas

- **VIN patikra** — transporto skelbimams su 17 simbolių VIN
- **Verifikuotas meistras** — paslaugų kategorijoms
- **Atstumas** — leiskite GPS, feed rodo „X km“ (Haversine + mock geokodavimas)
- **GDPR** — pirmą kartą naudojant mikrofoną/kamerą rodomas sutikimo modalas; atšaukti galima Profilis → Privatumas

## SEO ir slug URL

- Statinių skelbimų puslapiai: `/listing/[slug]/` (SSG)
- Nauji vartotojo skelbimai naudoja `vercel.json` rewrite → `/listing/?slug=...`
- OG/meta generuojami per `generateListingMetadata()`

## API endpointai (Express)

Kai `NEXT_PUBLIC_API_URL` nustatytas, frontend sinchronizuoja:

| Metodas | Kelias | Paskirtis |
|---------|--------|-----------|
| GET/PATCH | `/api/listings/:id` | Skelbimo atnaujinimas |
| GET/POST | `/api/reports` | Moderacijos pranešimai |
| PATCH | `/api/reports/:id` | Uždaryti / atnaujinti ticket |
| GET/PUT | `/api/banned-users` | Užblokuoti vartotojai |
| POST | `/api/users/:id/warn` | Įspėjimas vartotojui |

Migracijos paleidžiamos automatiškai API starto metu (`server/migrations/`).

## SMS pranešimai (demo)

Jei pokalbyje gaunate atsakymą ir 15 s neatsidarote — rodomas mock SMS toast (tik demonstracija, be tikro operatoriaus).
