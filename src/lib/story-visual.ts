import type { Listing } from "@/lib/types";
import { getListingCoverImage } from "@/lib/listing-image";
import { getSafeImageUrl } from "@/lib/utils";
import { buildListingSharePayload } from "@/lib/social-share";
import { collectListingHighlights } from "@vauto/shared/listing-og";

/** Instagram / TikTok Stories & Reels — 9:16 master. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const BRAND_NAVY = "#0f2744";
const BRAND_EMERALD = "#10b981";
const BRAND_EMERALD_SOFT = "#e8f5f3";
const INK = "#f8fafc";
const MUTED = "#cbd5e1";

export interface StoryVisualResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  fileName: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nepavyko įkelti nuotraukos"));
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, "")}…`.trim();
  }
  return lines;
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Client-side 9:16 Story / Reels card:
 * cover photo + title + price + VAUTO brand + CTA.
 */
export async function renderListingStoryVisual(
  listing: Listing
): Promise<StoryVisualResult> {
  if (typeof document === "undefined") {
    throw new Error("Story vizualas veikia tik naršyklėje");
  }

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nepavyko sukurti canvas");

  const priceText =
    listing.priceLabel?.trim() ||
    (listing.price > 0 ? `${Math.round(listing.price)} €` : "Kaina derinama");
  const city =
    String(listing.location ?? "")
      .split(",")[0]
      ?.trim() || "Lietuva";
  const title = String(listing.title ?? "Skelbimas").trim() || "Skelbimas";
  const highlights = collectListingHighlights(
    {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      priceLabel: listing.priceLabel,
      location: listing.location,
      category: listing.category,
      attributes: listing.attributes as Record<string, unknown> | null,
      images: listing.images,
    },
    2
  );
  const coverRaw = getListingCoverImage(listing);
  const coverSrc = getSafeImageUrl(coverRaw) || coverRaw;

  // Background
  ctx.fillStyle = BRAND_NAVY;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Photo band (upper 62%)
  const photoTop = 160;
  const photoH = Math.round(STORY_HEIGHT * 0.58);
  let photoOk = false;
  if (coverSrc) {
    try {
      const img = await loadImage(coverSrc);
      drawCoverFit(ctx, img, 0, photoTop, STORY_WIDTH, photoH);
      photoOk = true;
    } catch {
      photoOk = false;
    }
  }
  if (!photoOk) {
    const g = ctx.createLinearGradient(0, photoTop, STORY_WIDTH, photoTop + photoH);
    g.addColorStop(0, "#163a5c");
    g.addColorStop(1, "#10b981");
    ctx.fillStyle = g;
    ctx.fillRect(0, photoTop, STORY_WIDTH, photoH);
    ctx.fillStyle = MUTED;
    ctx.font = "600 42px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VAUTO", STORY_WIDTH / 2, photoTop + photoH / 2);
  }

  // Soft vignette over photo bottom
  const fade = ctx.createLinearGradient(
    0,
    photoTop + photoH * 0.55,
    0,
    photoTop + photoH + 40
  );
  fade.addColorStop(0, "rgba(15,39,68,0)");
  fade.addColorStop(1, "rgba(15,39,68,0.95)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, photoTop + photoH * 0.55, STORY_WIDTH, photoH * 0.45 + 40);

  // Top brand bar
  ctx.fillStyle = "rgba(15,39,68,0.72)";
  ctx.fillRect(0, 0, STORY_WIDTH, 140);
  ctx.fillStyle = BRAND_EMERALD_SOFT;
  ctx.font = "800 54px Outfit, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("VAUTO", 64, 88);
  ctx.fillStyle = BRAND_EMERALD;
  ctx.fillRect(64, 108, 120, 6);
  ctx.fillStyle = MUTED;
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Skelbimai Lietuvoje", STORY_WIDTH - 64, 88);

  // Bottom content panel
  const panelY = photoTop + photoH - 80;
  ctx.fillStyle = BRAND_NAVY;
  ctx.fillRect(0, panelY, STORY_WIDTH, STORY_HEIGHT - panelY);

  // Price pill
  ctx.fillStyle = BRAND_EMERALD;
  roundRect(ctx, 64, panelY + 48, 360, 72, 36);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(priceText, 64 + 180, panelY + 96);

  // Title
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = "700 58px Outfit, system-ui, sans-serif";
  const titleLines = wrapLines(ctx, title, STORY_WIDTH - 128, 3);
  let ty = panelY + 180;
  for (const line of titleLines) {
    ctx.fillText(line, 64, ty);
    ty += 72;
  }

  // Meta line
  ctx.fillStyle = MUTED;
  ctx.font = "500 32px system-ui, sans-serif";
  const meta = [city, ...highlights].filter(Boolean).join(" · ");
  ctx.fillText(meta.slice(0, 48), 64, ty + 28);

  // CTA button
  const ctaY = STORY_HEIGHT - 220;
  ctx.fillStyle = BRAND_EMERALD;
  roundRect(ctx, 64, ctaY, STORY_WIDTH - 128, 100, 50);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Žiūrėti skelbimą · vauto.lt", STORY_WIDTH / 2, ctaY + 64);

  // Footer
  ctx.fillStyle = "rgba(203,213,225,0.7)";
  ctx.font = "500 24px system-ui, sans-serif";
  ctx.fillText("Stories · Reels · TikTok", STORY_WIDTH / 2, STORY_HEIGHT - 64);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Nepavyko eksportuoti PNG"))),
      "image/png",
      0.95
    );
  });
  const dataUrl = canvas.toDataURL("image/png");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9ąčęėįšųūž]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const fileName = `vauto-story-${slug || listing.id || "listing"}.png`;

  return {
    blob,
    dataUrl,
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    fileName,
  };
}

export function downloadStoryVisual(result: StoryVisualResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareStoryVisualFile(
  result: StoryVisualResult,
  listing: Listing,
  caption?: string
): Promise<"shared" | "downloaded" | "failed"> {
  const file = new File([result.blob], result.fileName, { type: "image/png" });
  const payload = buildListingSharePayload(listing);
  const text = caption?.trim() || payload.text;

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: payload.title,
        text,
      });
      return "shared";
    } catch {
      /* dismissed or unsupported */
    }
  }

  try {
    downloadStoryVisual(result);
    return "downloaded";
  } catch {
    return "failed";
  }
}
