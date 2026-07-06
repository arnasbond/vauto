# VAUTO Android (Capacitor)

Gamybiniam APK paruošimas Android Studio.

## Reikalavimai

- Node.js 20+
- Android Studio (SDK 34+, JDK 17)
- Firebase projektas su **Cloud Messaging** (Android push)

## Greitas startas

```powershell
npm install
npm run cap:assets    # ikonos + splash iš assets/
npm run apk           # debug APK (lokalus)
npm run apk -Release  # release APK (nepasirašytas)
```

Arba atidarykite `android/` Android Studio: **File → Open → android**.

## Automatinis CI build (GitHub Actions)

Kiekvienas **push į `master`** paleidžia workflow `.github/workflows/android-build.yml`:

1. Surinkia Next.js eksportą + Capacitor Android
2. Sugeneruoja debug APK
3. Publikuoja į **GitHub Releases** su tag `android-latest`

### Nuolatinės atsisiuntimo nuorodos

| Kanalas | URL |
|---------|-----|
| **GitHub Releases (tiesiogiai)** | https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk |
| **Per svetainę (telefonui)** | https://www.vauto.lt/download/vauto.apk |
| **Releases puslapis** | https://github.com/arnasbond/vauto/releases/tag/android-latest |

Rankinis paleidimas: GitHub → **Actions** → **Android APK Build & Release** → **Run workflow**.

## Konfigūracija

| Failas | Paskirtis |
|--------|-----------|
| `capacitor.config.json` | Gamybinė konfigūracija: `webDir: out`, `server.url: https://www.vauto.lt` |
| `capacitor.config.ts` | Dev / env (`CAPACITOR_USE_REMOTE`, `CAPACITOR_REMOTE_URL`) |
| `assets/icon-only.png` | App ikona — tik šešiakampis su „V“ (be teksto) |
| `assets/splash.png` | Pilnas logotipas + „VAUTO AI MARKETPLACE“ |

`webDir` yra lokalus statinis eksportas (`out/`). Gamybinėje programėlėje WebView kraunasi iš **`https://www.vauto.lt`** per `server.url` (žr. `scripts/build-apk.ps1`).

## Push pranešimai

| Platforma | Mechanizmas | Konfigūracija |
|-----------|-------------|---------------|
| **Android (natyvus)** | Firebase Cloud Messaging | `android/app/google-services.json` |
| **Web / PWA** | Web Push (VAPID) | Render: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

VAPID raktai **neveikia** natyviame Android FCM — serveris siunčia FCM per `FIREBASE_SERVICE_ACCOUNT_JSON` (Render blueprint).

### FCM nustatymas

1. [Firebase Console](https://console.firebase.google.com/) → Add Android app → package `com.vauto.app`
2. Atsisiųskite `google-services.json` → įdėkite į `android/app/google-services.json` (failas gitignored)
3. Įsitikinkite, kad Render turi `FIREBASE_SERVICE_ACCOUNT_JSON`
4. Surinkite APK iš naujo

Šablonas: `android/app/google-services.json.example`

## Teisės (AndroidManifest)

- `INTERNET` — tinklas
- `CAMERA`, `READ_MEDIA_IMAGES` — nuotraukų kėlimas
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — lokalizacija
- `POST_NOTIFICATIONS` — push (Android 13+)

## Deep links

- `com.vauto.app://auth/callback`
- `https://www.vauto.lt/auth/callback`
- `https://www.vauto.lt/pokalbiai`

## Asset atnaujinimas

Pakeiskite šaltinius `assets-source/` arba `assets/`, tada:

```powershell
npm run cap:assets
npx cap sync android
```

## Release pasirašymas

Release APK iš `npm run apk -Release` yra **nepasirašytas**. Android Studio: **Build → Generate Signed Bundle / APK**.
