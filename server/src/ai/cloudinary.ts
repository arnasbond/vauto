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
