"use client";

import { useMemo } from "react";
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

  const primaryPlatform = useMemo<"android" | "ios">(() => {
    if (preferred === "ios") return "ios";
    return "android";
  }, [preferred]);

  if (nativeApp) {
    return null;
  }

  const handleShare = async (platform: "android" | "ios") => {
    await (platform === "ios" ? shareIosPwa() : shareAndroidApk());
    onShare?.(platform);
  };

  const androidBlock = (
    <div
      className={cn(
        "rounded-2xl border p-4",
        primaryPlatform === "android"
          ? "border-[var(--vauto-blue)]/40 bg-[var(--vauto-blue)]/5"
          : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
      )}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--vauto-text)]">
        <Smartphone className="h-4 w-4 text-[var(--vauto-blue)]" />
        Android
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={startApkDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-blue)] py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          Atsisiųsti APK
        </button>
        {showShare && (
          <button
            type="button"
            onClick={() => void handleShare("android")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vauto-blue)]/30 px-4 py-3 text-sm font-semibold text-[var(--vauto-blue)]"
          >
            <Share2 className="h-4 w-4" />
            Dalintis APK
          </button>
        )}
      </div>
    </div>
  );

  const iosBlock = (
    <div
      className={cn(
        "rounded-2xl border p-4",
        primaryPlatform === "ios"
          ? "border-[var(--vauto-blue)]/40 bg-[var(--vauto-blue)]/5"
          : "border-[var(--vauto-border)] bg-[var(--vauto-surface)]"
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--vauto-text)]">
        <Apple className="h-4 w-4 text-[var(--vauto-blue)]" />
        iPhone (Safari)
      </p>
      <p className="mb-3 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        Atidarykite <strong>Safari</strong> → dalintis{" "}
        <strong>□↑</strong> → <strong>Pridėti į pradžios ekraną</strong>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/install/"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-blue)] py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98]"
        >
          Instrukcija
        </Link>
        {showShare && (
          <button
            type="button"
            onClick={() => void handleShare("ios")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--vauto-blue)]/30 px-4 py-3 text-sm font-semibold text-[var(--vauto-blue)]"
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
          <Download className="h-3.5 w-3.5 text-[var(--vauto-blue)]" />
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
