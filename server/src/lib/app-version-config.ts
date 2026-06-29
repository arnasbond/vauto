import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AppVersionPayload {
  latestVersion: string;
  versionCode: number;
  downloadUrl: string;
}

const DEFAULT_VERSION: AppVersionPayload = {
  latestVersion: "1.6.4",
  versionCode: 50,
  downloadUrl:
    "https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk",
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
  return {
    latestVersion: process.env.APP_LATEST_VERSION?.trim() || base.latestVersion,
    versionCode: Number(process.env.APP_VERSION_CODE ?? base.versionCode),
    downloadUrl: process.env.APP_DOWNLOAD_URL?.trim() || base.downloadUrl,
  };
}
