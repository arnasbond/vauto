import {
  mockExtractFromImage,
  mockExtractFromText,
} from "@/lib/ai-mocks";
import { apiVautoServer } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { shouldUseOfflineAiMocks } from "@/lib/ai-pipeline";
import { compressForAiVision } from "@/lib/native-media";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
import {
  clientExtractListingCombined,
  clientExtractListingFromImage,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";
import { mapVautoServerListing } from "@/lib/vauto-unified-client";
import type { AiExtractedListing } from "@/lib/types";

interface ExtractContext {
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  fileName?: string;
  transcript?: string;
  extraContext?: string;
  userCity?: string;
  contact?: string;
}

async function prepareImagesForAi(urls: string[]): Promise<string[]> {
  if (!urls.length) return [];
  return Promise.all(urls.map((url) => compressForAiVision(url)));
}

function resolveImages(ctx: ExtractContext): string[] {
  if (ctx.imageDataUrls?.length) return ctx.imageDataUrls;
  if (ctx.imageDataUrl) return [ctx.imageDataUrl];
  return [];
}

function mergeTranscript(ctx: ExtractContext): string | undefined {
  const parts = [ctx.transcript, ctx.extraContext]
    .map((s) => (s ? sanitizeSpeechTranscript(s.trim()) : ""))
    .filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

/** Gemini unified API (vauto-server) — vienintelis AI kelias. */
async function tryUnifiedExtract(
  ctx: ExtractContext,
  mode: "text" | "image" | "combined"
): Promise<AiExtractedListing | null> {
  if (!isAiProxyAvailable()) return null;

  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const images = await prepareImagesForAi(resolveImages(ctx));
  const text = mergeTranscript(ctx) ?? ctx.transcript?.trim();

  if (mode === "text" && text) {
    const res = await apiVautoServer({
      action: "parse_text",
      text,
      extraContext: ctx.extraContext,
      userCity: city,
      contact,
    });
    if (res && "listing" in res)
      return mapVautoServerListing(res.listing, city, res.visualPipeline);
  }

  if (mode === "image" && images[0]) {
    const res = await apiVautoServer({
      action: "analyze_image",
      imageDataUrl: images[0],
      imageDataUrls: images.length > 1 ? images : undefined,
      extraContext: ctx.extraContext,
      userCity: city,
      contact,
    });
    if (res && "listing" in res)
      return mapVautoServerListing(res.listing, city, res.visualPipeline);
  }

  if (mode === "combined" && images[0] && text) {
    const res = await apiVautoServer({
      action: "parse_combined",
      text,
      imageDataUrl: images[0],
      imageDataUrls: images.length > 1 ? images : undefined,
      extraContext: ctx.extraContext,
      userCity: city,
      contact,
    });
    if (res && "listing" in res)
      return mapVautoServerListing(res.listing, city, res.visualPipeline);
  }

  return null;
}

export async function extractFromImage(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const images = await prepareImagesForAi(resolveImages(ctx));
  const enriched = {
    ...ctx,
    imageDataUrl: images[0],
    imageDataUrls: images.length > 1 ? images : undefined,
  };

  const unified = await tryUnifiedExtract(enriched, "image");
  if (unified) return unified;

  if (images[0]) {
    try {
      const { runPhotoVisionSearch, mapVisionResultToListingExtract } =
        await import("@/lib/photo-vision-search");
      const vision = await runPhotoVisionSearch(images[0], {
        extraContext: ctx.extraContext,
        userCity: ctx.userCity,
      });
      if (vision && vision.confidence >= 0.35) {
        return mapVisionResultToListingExtract(vision, {
          userCity: ctx.userCity,
          contact: ctx.contact,
          extraContext: ctx.extraContext,
        });
      }
    } catch (e) {
      console.warn("[extractFromImage] Vision API fallback failed:", e);
    }
  }

  if (isClientGeminiAvailable() && images[0]) {
    try {
      return await clientExtractListingFromImage({
        imageDataUrl: images[0],
        imageDataUrls: images.length > 1 ? images : undefined,
        extraContext: ctx.extraContext,
        userCity: ctx.userCity,
        contact: ctx.contact,
      });
    } catch (e) {
      console.warn("[extractFromImage] client Gemini failed:", e);
    }
  }

  if (!shouldUseOfflineAiMocks()) {
    throw new Error("Gemini vaizdo atpažinimas nepasiekiamas");
  }

  return mockExtractFromImage(ctx.fileName, images[0]);
}

export async function extractFromVoice(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  return extractFromText(ctx);
}

export async function extractFromText(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const text = sanitizeSpeechTranscript(ctx.transcript ?? "");
  const unified = await tryUnifiedExtract({ ...ctx, transcript: text }, "text");
  if (unified) return unified;
  if (isAiProxyAvailable()) {
    throw new Error("AI teksto analizė nepavyko — bandykite dar kartą.");
  }
  return mockExtractFromText(text);
}

export async function extractCombined(
  ctx: ExtractContext
): Promise<AiExtractedListing> {
  const images = await prepareImagesForAi(resolveImages(ctx));
  const transcript = mergeTranscript(ctx);
  const merged: ExtractContext = { ...ctx, transcript, imageDataUrl: images[0] };

  const unified = await tryUnifiedExtract(merged, "combined");
  if (unified) return unified;

  if (images.length && transcript) {
    try {
      const fromImage = await extractFromImage(merged);
      const fromText = await extractFromText(merged);
      return {
        ...fromImage,
        title: fromText.title || fromImage.title,
        price: fromText.price > 0 ? fromText.price : fromImage.price,
        location: fromText.location || fromImage.location,
        confidence: Math.max(fromImage.confidence, fromText.confidence) * 0.95,
      };
    } catch {
      /* fall through to dev Gemini */
    }
  }

  if (isClientGeminiAvailable() && images[0]) {
    try {
      return await clientExtractListingCombined({
        imageDataUrl: images[0],
        imageDataUrls: images.length > 1 ? images : undefined,
        transcript,
        extraContext: ctx.extraContext,
        userCity: ctx.userCity,
        contact: ctx.contact,
      });
    } catch (e) {
      console.warn("[extractCombined] client Gemini failed:", e);
    }
  }

  if (images.length) return extractFromImage(merged);
  if (transcript) return extractFromText(merged);
  throw new Error("Nėra duomenų apdorojimui");
}
