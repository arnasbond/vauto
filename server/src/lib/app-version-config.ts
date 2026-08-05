import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AppVersionPayload {
  latestVersion: string;
  versionCode: number;
  downloadUrl: string;
  apkSizeBytes?: number;
  releaseNotesLt?: string;
  installHintLt?: string;
  forceUpdate?: boolean;
  minSupportedVersionCode?: number;
  /** Deployed git commit (Render / CI). */
  commitSha?: string;
}

/** Resolve running build commit for health/version probes. */
export function resolveCommitSha(): string {
  return (
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.APP_GIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    "dev"
  );
}

const DEFAULT_VERSION: AppVersionPayload = {
  latestVersion: "1.6.62",
  versionCode: 85,
  downloadUrl: "https://www.vauto.lt/download/vauto.apk",
  apkSizeBytes: 37309985,
  releaseNotesLt:
    "Stabilumo ir saugumo atnaujinimai, greitesnė paieška, patobulintas skelbimų katalogas.",
  installHintLt:
    "Atsisiuntę atidarykite vauto.apk → leiskite diegti iš nežinomų šaltinių → Įdiegti.",
  forceUpdate: false,
  minSupportedVersionCode: 50,
};

function readVersionConfigFile(): AppVersionPayload | null {
  const roots = [
    join(dirname(fileURLToPath(import.meta.url)), "../../../public/version-config.json"),
    join(process.cwd(), "public/version-config.json"),
    join(process.cwd(), "../public/version-config.json"),
  ];
  for (const filePath of roots) {
    try {
      const json = JSON.parse(readFileSync(filePath, "utf8")) as AppVersionPayload;
      if (json.latestVersion && typeof json.versionCode === "number") {
        return json;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

/** Production version manifest for GET /api/version and update checker. */
export function resolveAppVersionPayload(): AppVersionPayload {
  const fromFile = readVersionConfigFile();
  const base = fromFile ?? DEFAULT_VERSION;
  const versionCode = Number(process.env.APP_VERSION_CODE ?? base.versionCode);
  const apkSizeRaw = process.env.APP_APK_SIZE_BYTES?.trim();
  const apkSizeBytes = apkSizeRaw
    ? Number(apkSizeRaw)
    : base.apkSizeBytes;
  return {
    latestVersion: process.env.APP_LATEST_VERSION?.trim() || base.latestVersion,
    versionCode: Number.isFinite(versionCode) ? versionCode : base.versionCode,
    downloadUrl: process.env.APP_DOWNLOAD_URL?.trim() || base.downloadUrl,
    apkSizeBytes:
      typeof apkSizeBytes === "number" && Number.isFinite(apkSizeBytes)
        ? apkSizeBytes
        : undefined,
    releaseNotesLt: process.env.APP_RELEASE_NOTES_LT?.trim() || base.releaseNotesLt,
    installHintLt: process.env.APP_INSTALL_HINT_LT?.trim() || base.installHintLt,
    forceUpdate:
      process.env.APP_FORCE_UPDATE === "true" ||
      process.env.APP_FORCE_UPDATE === "1" ||
      Boolean(base.forceUpdate),
    minSupportedVersionCode:
      Number(process.env.APP_MIN_SUPPORTED_VERSION_CODE ?? base.minSupportedVersionCode) ||
      base.minSupportedVersionCode,
    commitSha: resolveCommitSha(),
  };
}
