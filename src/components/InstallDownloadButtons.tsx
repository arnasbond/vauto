"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, Download, Share2, Smartphone } from "lucide-react";
import Link from "next/link";
import {
  INSTALL_PAGE_URL,
  getPreferredInstallPlatform,
  isAndroid,
  isIOS,
  isNativeApp,
  shareAndroidApk,
  shareIosPwa,
  startApkDownload,
} from "@/lib/mobile-install";
import {
  DEFAULT_INSTALL_HINT_LT,
  fetchVersionConfig,
  formatApkSize,
  type VersionConfig,
} from "@/lib/app-version";
import { cn } from "@/lib/cn";

type InstallDownloadButtonsProps = {
  variant?: "stacked" | "row";
  showShare?: boolean;
  className?: string;
  onShare?: (platform: "android" | "ios") => void;
};

export function InstallDownloadButtons({
  variant = "stacked",
  showShare = true,
  className,
  onShare,
}: InstallDownloadButtonsProps) {
  const preferred = getPreferredInstallPlatform();
  const androidDevice = isAndroid();
  const iosDevice = isIOS();
  const nativeApp = isNativeApp();
  const [cfg, setCfg] = useState<VersionConfig | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void fetchVersionConfig()
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  const primaryPlatform = useMemo<"android" | "ios">(() => {
    if (preferred === "ios") return "ios";
    return "android";
  }, [preferred]);

  if (nativeApp) {
    return null;
  }

  const sizeLabel = formatApkSize(cfg?.apkSizeBytes);
  const versionLabel = cfg?.latestVersion;
  const hint = cfg?.installHintLt || DEFAULT_INSTALL_HINT_LT;

  const handleShare = async (platform: "android" | "ios") => {
    await (platform === "ios" ? shareIosPwa() : shareAndroidApk());
    onShare?.(platform);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await startApkDownload();
    } finally {
      window.setTimeout(() => setDownloading(false), 2500);
    }
  };

  const androidBlock = (
    <div
      className={cn(
        "rounded-2xl border p-4",
        primaryPlatform === "android"
          ? "border-[var(--vauto-primary)]/40 bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)]"
          : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
      )}
    >
      <p className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--vauto-text)]">
        <Smartphone className="h-4 w-4 text-[var(--vauto-primary)]" />
        Android
      </p>
      <p className="mb-3 text-xs text-[var(--vauto-text-muted)]">
        {versionLabel ? `Versija v${versionLabel}` : "Naujausia APK"}
        {sizeLabel ? ` · ${sizeLabel}` : ""}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-70"
        >
          <Download className="h-4 w-4" />
          {downloading
            ? "Pradedamas atsisiuntimas…"
            : `Atsisiųsti APK${versionLabel ? ` v${versionLabel}` : ""}`}
        </button>
        {showShare && (
          <button
            type="button"
            onClick={() => void handleShare("android")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/30 px-4 py-3 text-sm font-semibold text-[var(--vauto-primary)]"
          >
            <Share2 className="h-4 w-4" />
            Dalintis
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
        <li>1. Atsisiųskite failą {sizeLabel ? `(~${sizeLabel})` : ""}</li>
        <li>2. Atidarykite <strong>vauto.apk</strong></li>
        <li>3. Leiskite diegti iš nežinomų šaltinių, jei prašo</li>
        <li>4. Paspauskite <strong>Įdiegti</strong></li>
      </ol>
      <p className="mt-2 text-[10px] text-[var(--vauto-text-muted)]">{hint}</p>
    </div>
  );

  const iosBlock = (
    <div
      className={cn(
        "rounded-2xl border p-4",
        primaryPlatform === "ios"
          ? "border-[var(--vauto-primary)]/40 bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)]"
          : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--vauto-text)]">
        <Apple className="h-4 w-4 text-[var(--vauto-primary)]" />
        iPhone (Safari)
      </p>
      <p className="mb-3 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        Atidarykite <strong>Safari</strong> → dalintis{" "}
        <strong>□↑</strong> → <strong>Pridėti į pradžios ekraną</strong>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/install/"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98]"
        >
          Instrukcija
        </Link>
        {showShare && (
          <button
            type="button"
            onClick={() => void handleShare("ios")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/30 px-4 py-3 text-sm font-semibold text-[var(--vauto-primary)]"
          >
            <Share2 className="h-4 w-4" />
            Dalintis nuorodą
          </button>
        )}
      </div>
    </div>
  );

  const ordered =
    primaryPlatform === "ios" ? (
      <>
        {iosBlock}
        {androidBlock}
      </>
    ) : (
      <>
        {androidBlock}
        {iosBlock}
      </>
    );

  return (
    <div
      className={cn(
        "space-y-3",
        variant === "row" && "grid gap-3 sm:grid-cols-2",
        className
      )}
    >
      {(iosDevice || androidDevice) && (
        <p className="flex items-center gap-2 text-xs text-[var(--vauto-text-muted)]">
          <Download className="h-3.5 w-3.5 text-[var(--vauto-primary)]" />
          {iosDevice
            ? "Jūsų iPhone — naudokite Safari ir pridėkite į pradžios ekraną."
            : "Jūsų Android — atsisiųskite APK vienu paspaudimu."}
        </p>
      )}
      {ordered}
      <p className="text-center text-[10px] text-[var(--vauto-text-muted)]">
        <a href={INSTALL_PAGE_URL} className="underline">
          Pilnos instrukcijos
        </a>
      </p>
    </div>
  );
}
