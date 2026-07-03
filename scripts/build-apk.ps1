# Build Vauto Android APK (debug by default, release with -Release)
param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$variant = if ($Release) { "Release" } else { "Debug" }
$gradleTask = if ($Release) { "assembleRelease" } else { "assembleDebug" }
$apkName = if ($Release) { "app-release-unsigned.apk" } else { "app-debug.apk" }
$outName = if ($Release) { "vauto-release-unsigned.apk" } else { "vauto-debug.apk" }

Write-Host "==> Syncing runtime config..." -ForegroundColor Cyan
$env:NEXT_PUBLIC_API_URL = if ($env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL } else { "https://vauto-api.onrender.com" }
npm run sync:runtime-config
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Building Next.js static export..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path "out\index.html")) {
    Write-Host "out/index.html nerastas — build nepavyko." -ForegroundColor Red
    exit 1
}

Write-Host "==> Syncing Capacitor Android (live web: www.vauto.lt)..." -ForegroundColor Cyan
$env:CAPACITOR_USE_REMOTE = "1"
$env:CAPACITOR_REMOTE_URL = "https://www.vauto.lt"
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Building $variant APK..." -ForegroundColor Cyan
Set-Location android
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat $gradleTask
} else {
    .\gradlew $gradleTask
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $root

$apk = Join-Path $root "android\app\build\outputs\apk\$($variant.ToLower())\$apkName"
$dist = Join-Path $root "dist"
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
if (Test-Path $apk) {
    Copy-Item $apk (Join-Path $dist $outName) -Force
    Write-Host ""
    Write-Host "APK sukurta ($variant):" -ForegroundColor Green
    Write-Host $apk
    Write-Host "Kopija:" -ForegroundColor Green
    Write-Host (Join-Path $dist $outName)
    Write-Host ""
    if ($Release) {
        Write-Host "Release APK nepasirasyta - pasirasykite Android Studio arba jarsigner pries platinima." -ForegroundColor Yellow
    }
    Write-Host "Idiekite i telefona:" -ForegroundColor Yellow
    Write-Host ('  adb install -r "' + $apk + '"')
} else {
    Write-Host "APK nerasta. Patikrinkite Gradle klaidas." -ForegroundColor Red
    exit 1
}
