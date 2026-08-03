/** Cloudinary upload — unsigned preset OR signed admin credentials. */

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

  const form = new FormData();
  form.append("file", imageDataUrl);
  form.append("folder", folder);
  if (options?.publicId) form.append("public_id", options.publicId);
  if (options?.listingId) {
    form.append("context", `listingId=${options.listingId}`);
    form.append("tags", options.listingId);
  }

  const headers: Record<string, string> = {};
  if (apiKey && apiSecret) {
    headers.Authorization = `Basic ${basicAuth(apiKey, apiSecret)}`;
  } else if (uploadPreset) {
    form.append("upload_preset", uploadPreset);
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", headers, body: form }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!data.secure_url) throw new Error("Cloudinary returned no URL");

  return {
    url: data.secure_url,
    publicId: data.public_id ?? "",
  };
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
