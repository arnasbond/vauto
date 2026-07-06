const STUDIO_BG = "#F0F1F3";

export async function removeBackgroundClipdrop(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.CLIPDROP_API_KEY?.trim();
  if (!key) throw new Error("CLIPDROP_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", STUDIO_BG);

  const res = await fetch("https://clipdrop-api.co/remove-background/v1", {
    method: "POST",
    headers: { "x-api-key": key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Clipdrop HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeBackgroundRemoveBg(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.REMOVEBG_API_KEY?.trim();
  if (!key) throw new Error("REMOVEBG_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", STUDIO_BG);
  form.append("size", "auto");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`remove.bg HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
