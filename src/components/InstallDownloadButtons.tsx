"use client";

import { useMemo } from "react";
import { Apple, Download, Share2, Smartphone } from "lucide-react";
import {
  APK_DOWNLOAD_URL,
  IOS_DOWNLOAD_URL,
  getIosInstallUrl,
  getPreferredInstallPlatform,
  hasTestFlightLink,
  isAndroid,
  isIOS,
  shareAndroidApk,
  shareIosApp,
} from "@/lib/mobile-install";
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
  const testFlight = hasTestFlightLink();
  const iosInstallUrl = getIosInstallUrl();

  const primaryPlatform = useMemo<"android" | "ios">(() => {
    if (preferred === "ios") return "ios";
    return "android";
  }, [preferred]);

  const handleShare = async (platform: "android" | "ios") => {
    await (platform === "ios" ? shareIosApp() : shareAndroidApk());
    onShare?.(platform);
  };

  const iosLabel = testFlight
    ? "Gauti per TestFlight (iPhone)"
    : "Įdiegti iOS programėlę (iPhone)";

  const androidButton = (
    <div
      className={cn(
        "flex gap-2",
        variant === "stacked" ? "flex-col" : "flex-1 flex-col sm:flex-row"
      )}
    >
      <a
        href={APK_DOWNLOAD_URL}
        download="vauto.apk"
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white shadow-md transition active:scale-[0.98]",
          primaryPlatform === "android"
            ? "bg-[var(--vauto-blue)]"
            : "border border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text)]"
        )}
      >
        <Smartphone className="h-4 w-4" />
        Atsisiųsti Android APK
      </a>
      {showShare && (
        <button
          type="button"
          onClick={() => void handleShare("android")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98]",
            primaryPlatform === "android"
              ? "border-[var(--vauto-blue)]/30 text-[var(--vauto-blue)]"
              : "border-[var(--vauto-border)] text-[var(--vauto-text-muted)]"
          )}
        >
          <Share2 className="h-4 w-4" />
          Dalintis APK
        </button>
      )}
    </div>
  );

  const iosButton = (
    <div
      className={cn(
        "flex gap-2",
        variant === "stacked" ? "flex-col" : "flex-1 flex-col sm:flex-row"
      )}
    >
      <a
        href={iosInstallUrl}
        {...(testFlight ? {} : { download: "vauto.ipa" })}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white shadow-md transition active:scale-[0.98]",
          primaryPlatform === "ios"
            ? "bg-[var(--vauto-blue)]"
            : "border border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text)]"
        )}
      >
        <Apple className="h-4 w-4" />
        {iosLabel}
      </a>
      {showShare && (
        <button
          type="button"
          onClick={() => void handleShare("ios")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98]",
            primaryPlatform === "ios"
              ? "border-[var(--vauto-blue)]/30 text-[var(--vauto-blue)]"
              : "border-[var(--vauto-border)] text-[var(--vauto-text-muted)]"
          )}
        >
          <Share2 className="h-4 w-4" />
          {testFlight ? "Dalintis TestFlight" : "Dalintis iOS"}
        </button>
      )}
      {!testFlight && primaryPlatform === "ios" && (
        <a
          href={IOS_DOWNLOAD_URL}
          download="vauto.ipa"
          className="text-center text-[11px] text-[var(--vauto-text-muted)] underline"
        >
          Arba atsisiųsti nepasirašytą IPA (reikia Xcode)
        </a>
      )}
    </div>
  );

  const ordered =
    primaryPlatform === "ios" ? (
      <>
        {iosButton}
        {androidButton}
      </>
    ) : (
      <>
        {androidButton}
        {iosButton}
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
          <Download className="h-3.5 w-3.5 text-[var(--vauto-blue)]" />
          {iosDevice
            ? testFlight
              ? "Jūsų iPhone — atidarykite TestFlight nuorodą."
              : "Jūsų iPhone — OTA įdiegimas arba TestFlight (kai sukonfigūruota)."
            : "Jūsų Android — siūlome APK pirmiausia."}
        </p>
      )}
      {ordered}
    </div>
  );
}
