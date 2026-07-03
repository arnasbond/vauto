# ENV_MAP.md
All keys found in codebase. **Values not shown.**

## Frontend (build / runtime)
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| NEXT_PUBLIC_API_URL | Express API base URL | **CRITICAL** |
| NEXT_PUBLIC_GOOGLE_CLIENT_ID | Google One Tap / OAuth | **CRITICAL** (prod auth) |
| NEXT_PUBLIC_GEMINI_API_KEY | Browser-side Gemini calls | **CRITICAL** (search intent) |
| NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID | Sign in with Apple | Optional |
| NEXT_PUBLIC_REFERRAL_BASE | Referral link base URL | Optional |
| NEXT_PUBLIC_APP_ORIGIN | Share/OG default origin | Optional |
| NEXT_PUBLIC_SHOW_DEMO_CATALOG | Force demo listings in prod build | Optional |
| NEXT_PUBLIC_INVESTOR_DEMO | Investor demo mode | Optional |
| NEXT_PUBLIC_IOS_TESTFLIGHT_URL | iOS TestFlight link | Optional |
| NODE_ENV | dev vs production behavior | **CRITICAL** |
| CAPACITOR_REMOTE_URL | Capacitor WebView URL | Optional |
| CAPACITOR_USE_REMOTE | Load remote vs bundled | Optional |
| PLAYWRIGHT_BASE_URL | E2E target | Dev only |
| CI | Playwright forbidOnly | Dev only |

## Server — core
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| DATABASE_URL | PostgreSQL connection | **CRITICAL** |
| PORT | HTTP listen (default 4000) | **CRITICAL** |
| NODE_ENV | Prod guards, demo OTP | **CRITICAL** |
| JWT_SECRET | HS256 signing | **CRITICAL** (fatal if missing/dev in prod) |
| JWT_TTL_MS | Token lifetime (default 7d) | Optional |
| APP_ORIGIN | CORS/checkout URLs | **CRITICAL** |
| PUBLIC_API_URL | Stripe webhook URL bootstrap | **CRITICAL** |

## Server — auth
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| TWILIO_ACCOUNT_SID | SMS OTP | **CRITICAL** (prod phone auth) |
| TWILIO_AUTH_TOKEN | SMS OTP | **CRITICAL** |
| TWILIO_FROM_NUMBER | SMS sender | **CRITICAL** |
| GOOGLE_CLIENT_ID | Google token verify | **CRITICAL** |
| ADMIN_EMAIL | Super-admin elevation | **CRITICAL** |
| ADMIN_PHONE | Admin OTP elevation | **CRITICAL** |
| ALLOW_LEGACY_USER_HEADER | `x-user-id` auth bypass | **RISK** (non-prod default on) |
| VAUTO_DEMO_OTP | Fixed OTP code | **RISK** (dev/demo) |
| VAUTO_DEMO_PHONES | Whitelist demo phones | **RISK** |

## Server — AI / media
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| GEMINI_API_KEY | Gemini REST | **CRITICAL** |
| AI_KEY | Gemini alias | **CRITICAL** |
| GOOGLE_AI_API_KEY | Gemini alias | **CRITICAL** |
| CLOUDINARY_CLOUD_NAME | Image upload | Optional (503 if missing) |
| CLOUDINARY_UPLOAD_PRESET | Unsigned upload preset | Optional |

## Server — payments
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| STRIPE_SECRET_KEY | Stripe API | **CRITICAL** |
| STRIPE_WEBHOOK_SECRET | Webhook signature | **CRITICAL** |
| STRIPE_CONNECT_ESCROW | Disable Connect escrow (`false`) | Optional |
| STRIPE_WEBHOOK_URL | Auto webhook registration | Optional |
| STRIPE_AUTO_WEBHOOK | Bootstrap webhook on boot | Optional |

## Server — push / email
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| VAPID_PUBLIC_KEY | Web push | **CRITICAL** (web push) |
| VAPID_PRIVATE_KEY | Web push | **CRITICAL** |
| VAPID_SUBJECT | Web push contact | Optional |
| FIREBASE_SERVICE_ACCOUNT_JSON | FCM native push | Optional |
| RESEND_API_KEY | Report email | Optional |
| EMAIL_FROM | Sender address | Optional |
| ADMIN_NOTIFY_EMAIL | Admin alert recipients | Optional |

## Server — vehicle / shipping
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| REGITRA_PLATE_API_USERNAME | LT plate lookup | Optional (demo fallback) |
| REGITRA_PLATE_API_PASSWORD | LT plate lookup | Optional |
| REGITRA_PLATE_API_URL | LT plate API base | Optional |
| OMNIVA_API_KEY | Real carrier labels | **NOT IMPLEMENTED** in code |
| OMNIVA_API_URL | Real carrier labels | **NOT IMPLEMENTED** in code |
| DPD_API_KEY | Real carrier labels | **NOT IMPLEMENTED** in code |

## Server — portal sync / ops
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| SPINTA_SYNC_CRON_SECRET | External cron auth header | **CRITICAL** (if cron used) |
| ENABLE_PORTAL_SYNC_CRON | Disable in-process cron | Optional |
| PORTAL_SCRAPER_DISABLED | Kill Playwright scraper | Optional |
| VAUTO_DEMO_CATALOG | Server demo seed | Optional |
| VAUTO_ALLOW_DEMO_WALLET | Demo wallet top-up in prod | **RISK** if enabled |
| APP_LATEST_VERSION | Version endpoint | Optional |
| APP_VERSION_CODE | Version code | Optional |
| APP_DOWNLOAD_URL | APK download URL | Optional |

## Server — rate limits
| KEY | Purpose | Criticality |
|-----|---------|-------------|
| API_RATE_LIMIT_PER_MIN | Default 30 | Optional |
| AUTH_RATE_LIMIT_PER_MIN | Default 30 | Optional |
| AI_RATE_LIMIT_PER_MIN | Default 8 | Optional |
| ACTION_RATE_LIMIT_PER_MIN | Default 50 | Optional |
| SEARCH_RATE_LIMIT_PER_MIN | Default 10 | Optional |

## CI / deploy scripts (not runtime app)
| KEY | Purpose |
|-----|---------|
| RENDER_API_KEY | Render API automation |
| RENDER_SERVICE_ID / RENDER_SERVICE_NAME | Render target |
| RENDER_DB_NAME | DB provisioning |
| VERCEL_TOKEN / VERCEL_PROJECT_ID / VERCEL_ORG_ID | Vercel env sync |
| VAUTO_API_URL | verify-health.mjs override |
| STRICT_READINESS / STRICT_ANALYZE_SEARCH | Health script flags |
| GITHUB_REPO / RENDER_BRANCH | Blueprint provision |
