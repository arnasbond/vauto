/** Optional Cloudinary upload — set CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET */

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_UPLOAD_PRESET?.trim()
  );
}

export async function uploadImageToCloudinary(
  imageDataUrl: string,
  folder = "vauto"
): Promise<{ url: string; publicId: string }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  if (!cloudName || !uploadPreset) {
    throw Object.assign(new Error("Cloudinary not configured"), { status: 503 });
  }

  const form = new FormData();
  form.append("file", imageDataUrl);
  form.append("upload_preset", uploadPreset);
  form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form }
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
