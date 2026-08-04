/**
 * Cloudinary upload — unsigned preset OR signed api_key + signature.
 *
 * Accepts discrete CLOUDINARY_* vars on the **Render API** service, or a single
 * CLOUDINARY_URL (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`).
 * Uploads are server-side — NEXT_PUBLIC_CLOUDINARY_* is not required for publish.
 */

import { createHash } from "node:crypto";
import { File as NodeFile } from "node:buffer";

let hydratedFromUrl = false;

/** Parse CLOUDINARY_URL into discrete env vars when those are unset. */
export function hydrateCloudinaryEnvFromUrl(): void {
  if (hydratedFromUrl) return;
  hydratedFromUrl = true;
  const raw = process.env.CLOUDINARY_URL?.trim();
  if (!raw) return;
  try {
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/i.exec(raw);
    if (!match) {
      console.warn("[cloudinary] CLOUDINARY_URL present but could not be parsed");
      return;
    }
    const [, key, secret, cloud] = match;
    if (!process.env.CLOUDINARY_CLOUD_NAME?.trim() && cloud) {
      process.env.CLOUDINARY_CLOUD_NAME = decodeURIComponent(cloud);
    }
    if (!process.env.CLOUDINARY_API_KEY?.trim() && key) {
      process.env.CLOUDINARY_API_KEY = decodeURIComponent(key);
    }
    if (!process.env.CLOUDINARY_API_SECRET?.trim() && secret) {
      process.env.CLOUDINARY_API_SECRET = decodeURIComponent(secret);
    }
  } catch (err) {
    console.warn(
      "[cloudinary] CLOUDINARY_URL hydrate failed:",
      err instanceof Error ? err.message : err
    );
  }
}

export type CloudinaryConfigStatus = {
  configured: boolean;
  cloudName: boolean;
  uploadPreset: boolean;
  apiKey: boolean;
  apiSecret: boolean;
  cloudinaryUrl: boolean;
  authMode: "unsigned" | "signed" | "none";
  /** Env var names still missing for a working upload config (no secret values). */
  missing: string[];
  /** Operator-facing hint for Render Dashboard (Lithuanian). */
  hint: string;
};

export function getCloudinaryConfigStatus(): CloudinaryConfigStatus {
  hydrateCloudinaryEnvFromUrl();
  const cloudName = Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim());
  const uploadPreset = Boolean(process.env.CLOUDINARY_UPLOAD_PRESET?.trim());
  const apiKey = Boolean(process.env.CLOUDINARY_API_KEY?.trim());
  const apiSecret = Boolean(process.env.CLOUDINARY_API_SECRET?.trim());
  const cloudinaryUrl = Boolean(process.env.CLOUDINARY_URL?.trim());
  const signed = apiKey && apiSecret;
  const configured = cloudName && (uploadPreset || signed);
  const authMode: CloudinaryConfigStatus["authMode"] = uploadPreset
    ? "unsigned"
    : signed
      ? "signed"
      : "none";

  const missing: string[] = [];
  if (!cloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!uploadPreset && !signed) {
    if (!apiKey) missing.push("CLOUDINARY_API_KEY");
    if (!apiSecret) missing.push("CLOUDINARY_API_SECRET");
    // Unsigned preset is an alternative to signed keys — surface when neither works.
    if (!apiKey && !apiSecret) missing.push("CLOUDINARY_UPLOAD_PRESET");
  }

  const hint = configured
    ? `Cloudinary OK (${authMode}).`
    : `Render API (vauto-api) → Environment: nustatykite CLOUDINARY_CLOUD_NAME + (CLOUDINARY_UPLOAD_PRESET ARBA CLOUDINARY_API_KEY+CLOUDINARY_API_SECRET), arba CLOUDINARY_URL=cloudinary://key:secret@cloud_name. Trūksta: ${
        missing.join(", ") || "nežinoma"
      }. Po pakeitimo — Manual Deploy / Restart.`;

  return {
    configured,
    cloudName,
    uploadPreset,
    apiKey,
    apiSecret,
    cloudinaryUrl,
    authMode,
    missing,
    hint,
  };
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfigStatus().configured;
}

/** Lithuanian 503 body when Cloudinary env is incomplete on the API host. */
export function cloudinaryNotConfiguredError(): {
  message: string;
  code: "cloudinary_not_configured";
  missing: string[];
  hint: string;
} {
  const status = getCloudinaryConfigStatus();
  const missingSuffix = status.missing.length
    ? ` Trūksta: ${status.missing.join(", ")}.`
    : "";
  return {
    message: `Nuotraukų saugykla nepasiekiama (Cloudinary nesukonfigūruota).${missingSuffix} Patikrinkite CLOUDINARY_* kintamuosius Render API aplinkoje.`,
    code: "cloudinary_not_configured",
    missing: status.missing,
    hint: status.hint,
  };
}

function basicAuth(key: string, secret: string): string {
  return Buffer.from(`${key}:${secret}`).toString("base64");
}

/** Cloudinary signed-upload signature (sha1 of sorted key=value&… + api_secret). */
function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

function parseDataUrlFile(imageDataUrl: string): {
  bytes: Buffer;
  contentType: string;
  filename: string;
} {
  const trimmed = imageDataUrl.trim();
  // Allow optional params (charset=…) between mime and ;base64,
  const match = /^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/is.exec(trimmed);
  if (match) {
    const contentType = (match[1] || "image/jpeg").trim().toLowerCase();
    const bytes = Buffer.from(match[2]!, "base64");
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "jpg";
    return { bytes, contentType, filename: `listing.${ext}` };
  }
  // Remote HTTPS URL — Cloudinary accepts it as the `file` string value.
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      bytes: Buffer.alloc(0),
      contentType: "text/plain",
      filename: "",
    };
  }
  throw new Error("Cloudinary file must be a data:image URL or https URL");
}

type FileAppendMode = "multipart" | "data_uri";

export async function uploadImageToCloudinary(
  imageDataUrl: string,
  folder = "vauto",
  options?: { listingId?: string; publicId?: string }
): Promise<{ url: string; publicId: string }> {
  hydrateCloudinaryEnvFromUrl();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || (!uploadPreset && !(apiKey && apiSecret))) {
    const detail = cloudinaryNotConfiguredError();
    throw Object.assign(new Error(detail.message), {
      status: 503,
      code: detail.code,
      missing: detail.missing,
    });
  }

  const trimmed = imageDataUrl.trim();

  const appendFile = (form: FormData, mode: FileAppendMode) => {
    if (/^https?:\/\//i.test(trimmed)) {
      form.append("file", trimmed);
      return;
    }
    // Data-URI string is the proven Node/Render fallback when multipart File
    // parts are dropped or mis-typed by undici FormData.
    if (mode === "data_uri") {
      form.append("file", trimmed);
      return;
    }
    const parsed = parseDataUrlFile(trimmed);
    const bytes = new Uint8Array(parsed.bytes);
    try {
      const file = new NodeFile([bytes], parsed.filename, {
        type: parsed.contentType,
      });
      form.append("file", file);
    } catch {
      const blob = new Blob([bytes], { type: parsed.contentType });
      form.append("file", blob, parsed.filename);
    }
  };

  const postUpload = async (form: FormData, mode: string) => {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: form }
    );
    const errText = res.ok ? "" : await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[cloudinary] upload rejected:", res.status, errText.slice(0, 500), {
        mode,
        folder,
        listingId: options?.listingId,
      });
      throw new Error(`Cloudinary upload failed: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as {
      secure_url?: string;
      public_id?: string;
    };
    if (!data.secure_url) throw new Error("Cloudinary returned no URL");
    return {
      url: data.secure_url,
      publicId: data.public_id ?? "",
    };
  };

  const tryUpload = async (
    mode: string,
    fileMode: FileAppendMode,
    build: (form: FormData) => void
  ) => {
    const form = new FormData();
    appendFile(form, fileMode);
    build(form);
    return postUpload(form, `${mode}:${fileMode}`);
  };

  /**
   * Prefer unsigned preset when configured.
   * Unsigned presets REJECT unknown overwrite params (folder/tags/context/public_id)
   * unless explicitly allowed in the preset — that was breaking all listing uploads.
   * Try multipart File first, then data-URI string (legacy Node-safe path).
   */
  if (uploadPreset) {
    let presetErr: unknown;
    for (const fileMode of ["multipart", "data_uri"] as FileAppendMode[]) {
      try {
        return await tryUpload("unsigned_preset", fileMode, (form) => {
          form.append("upload_preset", uploadPreset);
        });
      } catch (err) {
        presetErr = err;
        console.warn(
          "[cloudinary] unsigned preset failed:",
          fileMode,
          err instanceof Error ? err.message.slice(0, 200) : err
        );
      }
    }
    if (!(apiKey && apiSecret)) throw presetErr;
  }

  if (apiKey && apiSecret) {
    let signedErr: unknown;
    for (const fileMode of ["multipart", "data_uri"] as FileAppendMode[]) {
      try {
        const timestamp = Math.round(Date.now() / 1000);
        const params: Record<string, string | number> = {
          timestamp,
          folder,
        };
        if (options?.publicId) params.public_id = options.publicId;
        if (options?.listingId) {
          params.context = `listingId=${options.listingId}`;
          params.tags = options.listingId;
        }
        const signature = signCloudinaryParams(params, apiSecret);
        return await tryUpload("signed", fileMode, (form) => {
          form.append("api_key", apiKey);
          form.append("timestamp", String(timestamp));
          form.append("signature", signature);
          form.append("folder", folder);
          if (options?.publicId) form.append("public_id", options.publicId);
          if (options?.listingId) {
            form.append("context", `listingId=${options.listingId}`);
            form.append("tags", options.listingId);
          }
        });
      } catch (err) {
        signedErr = err;
        console.warn(
          "[cloudinary] signed upload failed:",
          fileMode,
          err instanceof Error ? err.message.slice(0, 200) : err
        );
      }
    }
    throw signedErr instanceof Error
      ? signedErr
      : new Error(String(signedErr ?? "Cloudinary signed upload failed"));
  }

  throw Object.assign(new Error(cloudinaryNotConfiguredError().message), {
    status: 503,
    code: "cloudinary_not_configured",
  });
}

/** Extract Cloudinary public_id from a delivery URL (ignores non-Cloudinary URLs). */
export function cloudinaryPublicIdFromUrl(url: string): string | null {
  const raw = String(url ?? "").trim();
  if (!raw || !/res\.cloudinary\.com/i.test(raw)) return null;
  try {
    const pathname = new URL(raw).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx < 0) return null;
    let rest = parts.slice(uploadIdx + 1);
    // Skip transformation segments (contain , or start with letter flags) until version or asset path.
    while (rest.length > 0) {
      const seg = rest[0];
      if (/^v\d+$/.test(seg)) {
        rest = rest.slice(1);
        break;
      }
      if (seg.includes(",") || /^[a-z]_/.test(seg)) {
        rest = rest.slice(1);
        continue;
      }
      break;
    }
    if (!rest.length) return null;
    const withExt = rest.join("/");
    const publicId = withExt.replace(/\.[a-zA-Z0-9]+$/, "");
    return publicId || null;
  } catch {
    return null;
  }
}

const PROTECTED_PUBLIC_ID_PREFIXES = ["vauto/system/"];

function isProtectedPublicId(publicId: string): boolean {
  return PROTECTED_PUBLIC_ID_PREFIXES.some((p) => publicId.startsWith(p));
}

/**
 * Best-effort destroy of Cloudinary assets by delivery URL.
 * Skips system placeholders; never throws — listing hard-delete must still succeed.
 */
export async function destroyCloudinaryByUrls(
  urls: string[]
): Promise<{ attempted: number; destroyed: number; skipped: number }> {
  hydrateCloudinaryEnvFromUrl();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    return { attempted: 0, destroyed: 0, skipped: urls.length };
  }

  const uniqueIds = new Set<string>();
  for (const url of urls) {
    const id = cloudinaryPublicIdFromUrl(url);
    if (id && !isProtectedPublicId(id)) uniqueIds.add(id);
  }

  let destroyed = 0;
  let skipped = urls.length - uniqueIds.size;
  for (const publicId of uniqueIds) {
    try {
      const form = new FormData();
      form.append("public_id", publicId);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${basicAuth(apiKey, apiSecret)}` },
          body: form,
        }
      );
      if (res.ok) destroyed += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { attempted: uniqueIds.size, destroyed, skipped };
}
