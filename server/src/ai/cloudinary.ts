/** Cloudinary upload — unsigned preset OR signed api_key + signature. */

import { createHash } from "node:crypto";

export function isCloudinaryConfigured(): boolean {
  const cloud = Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim());
  const unsigned = Boolean(process.env.CLOUDINARY_UPLOAD_PRESET?.trim());
  const signed = Boolean(
    process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim()
  );
  return cloud && (unsigned || signed);
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
  const match = /^data:([^;]+);base64,(.+)$/is.exec(trimmed);
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

export async function uploadImageToCloudinary(
  imageDataUrl: string,
  folder = "vauto",
  options?: { listingId?: string; publicId?: string }
): Promise<{ url: string; publicId: string }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || (!uploadPreset && !(apiKey && apiSecret))) {
    throw Object.assign(new Error("Cloudinary not configured"), { status: 503 });
  }

  const trimmed = imageDataUrl.trim();

  const appendFile = (form: FormData) => {
    if (/^https?:\/\//i.test(trimmed)) {
      form.append("file", trimmed);
      return;
    }
    const parsed = parseDataUrlFile(trimmed);
    // Blob/File multipart is more reliable than a multi-MB data-URI text field.
    const blob = new Blob([new Uint8Array(parsed.bytes)], {
      type: parsed.contentType,
    });
    form.append("file", blob, parsed.filename);
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

  /**
   * Prefer unsigned preset when configured.
   * Unsigned presets REJECT unknown overwrite params (folder/tags/context/public_id)
   * unless explicitly allowed in the preset — that was breaking all listing uploads.
   */
  if (uploadPreset) {
    try {
      const form = new FormData();
      appendFile(form);
      form.append("upload_preset", uploadPreset);
      return await postUpload(form, "unsigned_preset");
    } catch (presetErr) {
      if (!(apiKey && apiSecret)) throw presetErr;
      console.warn(
        "[cloudinary] unsigned preset failed — retrying signed upload:",
        presetErr instanceof Error ? presetErr.message.slice(0, 200) : presetErr
      );
    }
  }

  if (apiKey && apiSecret) {
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
    const form = new FormData();
    appendFile(form);
    form.append("api_key", apiKey);
    form.append("timestamp", String(timestamp));
    form.append("signature", signature);
    form.append("folder", folder);
    if (options?.publicId) form.append("public_id", options.publicId);
    if (options?.listingId) {
      form.append("context", `listingId=${options.listingId}`);
      form.append("tags", options.listingId);
    }
    return await postUpload(form, "signed");
  }

  throw Object.assign(new Error("Cloudinary not configured"), { status: 503 });
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
