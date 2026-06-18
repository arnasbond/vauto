# Build Vauto debug APK for Android testing
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Building Next.js static export..." -ForegroundColor Cyan
npm run build

Write-Host "==> Syncing Capacitor Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "==> Building debug APK..." -ForegroundColor Cyan
Set-Location android
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat assembleDebug
} else {
    .\gradlew assembleDebug
}
Set-Location $root

$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
$dist = Join-Path $root "dist"
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
if (Test-Path $apk) {
    Copy-Item $apk (Join-Path $dist "vauto-debug.apk") -Force
    Write-Host ""
    Write-Host "APK sukurta:" -ForegroundColor Green
    Write-Host $apk
    Write-Host "Kopija:" -ForegroundColor Green
    Write-Host (Join-Path $dist "vauto-debug.apk")
    Write-Host ""
    Write-Host "Idiekite i telefona:" -ForegroundColor Yellow
    Write-Host "  adb install -r `"$apk`""
} else {
    Write-Host "APK nerasta. Patikrinkite Gradle klaidas." -ForegroundColor Red
    exit 1
}
