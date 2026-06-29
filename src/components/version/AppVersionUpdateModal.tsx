"use client";

import { Download, Sparkles } from "lucide-react";
import { openAppUpdateDownload } from "@/lib/app-version";
import { useAppVersion } from "@/context/AppVersionContext";

/** Blocks native shell when local versionCode is behind GET /api/version. */
export function AppVersionUpdateModal() {
  const { status, remote, local } = useAppVersion();

  const isOutdated = status === "outdated_minor" || status === "outdated_major";
  if (!isOutdated || !remote) return null;

  const handleUpdate = () => {
    void openAppUpdateDownload(remote.downloadUrl);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#0a1128]/95 p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Programėlės atnaujinimas"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-600 bg-[#1e293b] p-6 text-center text-white shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-600/40 to-[#6366f1]/40">
          <Sparkles className="h-7 w-7 text-fuchsia-300" />
        </div>

        <h2 className="font-display text-lg font-bold">
          Reikalingas VAUTO atnaujinimas
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Jūsų versija{" "}
          <span className="font-semibold text-white">
            {local?.versionName ?? "?"} (code {local?.versionCode ?? "?"})
          </span>{" "}
          atsilieka nuo gamybinės{" "}
          <span className="font-semibold text-fuchsia-300">v{remote.latestVersion}</span>.
          Atnaujinkite, kad tęstumėte naudojimąsi be trikdžių.
        </p>

        <button
          type="button"
          onClick={handleUpdate}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-[#4f46e5] py-3.5 text-sm font-bold text-white shadow-lg hover:from-fuchsia-500 hover:to-[#6366f1]"
        >
          <Download className="h-5 w-5" />
          Atsisiųsti v{remote.latestVersion}
        </button>

        <p className="mt-3 text-[11px] text-slate-500">
          Atsisiuntimas atsidarys sistemos naršyklėje (GitHub Releases).
        </p>
      </div>
    </div>
  );
}
