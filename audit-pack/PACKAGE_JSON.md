# PACKAGE_JSON.md
Source: `package.json` (root v1.6.4) + `server/package.json` (v0.1.0)

## Root — dependencies
| Package | Version |
|---------|---------|
| @capacitor/android | ^6.2.1 |
| @capacitor/app | ^6.0.3 |
| @capacitor/camera | ^6.1.2 |
| @capacitor/core | ^6.2.1 |
| @capacitor/geolocation | ^6.1.0 |
| @capacitor/ios | ^6.2.1 |
| @capacitor/preferences | ^6.0.4 |
| @capacitor/push-notifications | ^6.0.4 |
| @capacitor/share | ^6.0.4 |
| @capacitor/splash-screen | ^6.0.3 |
| @capacitor/status-bar | ^6.0.2 |
| commander | ^12.1.0 |
| leaflet | ^1.9.4 |
| lucide-react | ^0.511.0 |
| next | ^15.3.3 |
| react | ^19.1.0 |
| react-dom | ^19.1.0 |
| react-leaflet | ^5.0.0 |
| supercluster | ^8.0.1 |

## Root — devDependencies
| Package | Version |
|---------|---------|
| @capacitor/cli | ^6.2.1 |
| @eslint/eslintrc | ^3.3.5 |
| @playwright/test | ^1.61.0 |
| @tailwindcss/postcss | ^4.1.8 |
| @types/leaflet | ^1.9.21 |
| @types/node | ^22.15.21 |
| @types/react | ^19.1.4 |
| @types/react-dom | ^19.1.5 |
| @types/supercluster | ^7.1.3 |
| @vercel/node | ^5.8.17 |
| eslint | ^8.57.1 |
| eslint-config-next | ^15.5.19 |
| playwright | ^1.61.0 |
| tailwindcss | ^4.1.8 |
| typescript | ^5.8.3 |

## Root — scripts
| Script | Command |
|--------|---------|
| dev | next dev |
| build | node scripts/generate-sitemap.mjs && next build |
| build:clean | rm .next + build |
| start | next start |
| lint | next lint |
| test:e2e | npm run build && playwright test |
| test:e2e:install | playwright install chromium |
| build:mobile | next build |
| cap:sync / cap:sync:ios | Capacitor sync |
| cap:open / cap:open:ios | Open native IDE |
| apk | scripts/build-apk.ps1 |
| ios:stage2 | _later/ios-testflight setup |
| server:install/dev/build/start | server npm |
| db:up | docker compose up -d |
| db:seed | server seed |
| pitch:pdf | generate-pitch-pdf.mjs |
| provision:render | provision-render.mjs |
| redeploy:render | redeploy-render.mjs |
| render:stripe-env | set-render-stripe-env.mjs |
| render:configure-env | configure-render-env.mjs |
| verify:health | verify-health.mjs |
| validate:catalogs | validate-catalogs.mjs |
| verify:health:strict | verify-health.mjs --strict-readiness |
| sync:runtime-config | write-runtime-config.mjs |
| test:api-smoke | api-listing-smoke.mjs |
| audit:security | audit-security.mjs |
| test:server-smoke | server build + validation-smoke.mjs |
| sim:e2e | server e2e:simulate |
| generate:mock-catalog | generate-mock-catalog.mjs |
| generate:sitemap | generate-sitemap.mjs |
| audit:catalog | audit-catalog.mjs |
| audit:images | check-unsplash-urls.mjs |
| validate:fast-search | validate-fast-search.mjs |

## Server — dependencies
| Package | Version |
|---------|---------|
| cors | ^2.8.5 |
| dotenv | ^16.4.7 |
| express | ^4.21.2 |
| express-rate-limit | ^8.5.2 |
| firebase-admin | ^13.4.0 |
| node-cron | ^4.5.0 |
| pg | ^8.13.3 |
| playwright | ^1.61.0 |
| sharp | ^0.34.3 |
| stripe | ^17.7.0 |
| web-push | ^3.6.7 |

## Server — scripts
| Script | Command |
|--------|---------|
| dev | tsx watch src/index.ts |
| start | node dist/index.js |
| build | tsc |
| seed | tsx src/seed.ts |
| e2e:simulate | tsx src/test/vauto-e2e-simulation.ts |
| setup-stripe | tsx scripts/setup-stripe.ts |
