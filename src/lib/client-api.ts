import {
  mockExtractFromImage,
  mockExtractFromText,
  mockExtractFromVoice,
} from "@/lib/ai-mocks";
import {
  apiExtractCombined,
  apiExtractImage,
  apiExtractText,
  apiVautoServer,
} from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { compressForAiVision } from "@/lib/native-media";
import { hasOpenAiKey } from "@/lib/openai-settings";
import {
  extractFromImageOpenAI,
  extractFromTextOpenAI,
  extractFromVoiceOpenAI,
} from "@/lib/openai";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
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

/** Primary path: unified Gemini server (parse_text / analyze_image / parse_combined) */
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
      return mapVautoServerListing(res.listing, city);
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
      return mapVautoServerListing(res.listing, city);
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
      return mapVautoServerListing(res.listing, city);
  }

  return null;
}

export async function extractFromImage(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const images = await prepareImagesForAi(resolveImages(ctx));
  const primary = images[0];

  const unified = await tryUnifiedExtract(ctx, "image");
  if (unified) return unified;

  if (isAiProxyAvailable() && primary) {
    const remote = await apiExtractImage({
      imageDataUrl: primary,
      imageDataUrls: images.length > 1 ? images : undefined,
      extraContext: ctx.extraContext,
      userCity: city,
      contact,
    });
    if (remote) return remote;
  }

  if (hasOpenAiKey() && primary) {
    try {
      return await extractFromImageOpenAI(
        images.length > 1 ? images : primary,
        city,
        contact,
        ctx.extraContext
      );
    } catch (e) {
      console.warn("[Vauto] OpenAI vision failed, using mock:", e);
    }
  }

  return mockExtractFromImage(ctx.fileName, primary);
}

export async function extractFromVoice(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const transcript = sanitizeSpeechTranscript(
    ctx.transcript ?? "Parduodu maišą obuolių, dešimt eurų, Lietuvoje"
  );

  const unified = await tryUnifiedExtract({ ...ctx, transcript }, "text");
  if (unified) return unified;

  if (isAiProxyAvailable() && transcript.trim()) {
    const remote = await apiExtractText({
      text: transcript,
      userCity: city,
      contact,
      extraContext: ctx.extraContext,
    });
    if (remote) return remote;
  }

  if (hasOpenAiKey()) {
    try {
      return await extractFromVoiceOpenAI(transcript, city, contact);
    } catch (e) {
      console.warn("[Vauto] OpenAI voice failed, using mock:", e);
    }
  }

  return mockExtractFromVoice(transcript);
}

export async function extractFromText(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const text = sanitizeSpeechTranscript(ctx.transcript ?? "");

  const unified = await tryUnifiedExtract({ ...ctx, transcript: text }, "text");
  if (unified) return unified;

  if (isAiProxyAvailable() && text.trim()) {
    const remote = await apiExtractText({ text, userCity: city, contact });
    if (remote) return remote;
  }

  if (hasOpenAiKey() && text.trim()) {
    try {
      return await extractFromTextOpenAI(text, city, contact);
    } catch (e) {
      console.warn("[Vauto] OpenAI text failed, using mock:", e);
    }
  }

  return mockExtractFromText(text);
}

export async function extractCombined(
  ctx: ExtractContext
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const images = await prepareImagesForAi(resolveImages(ctx));
  const transcript = mergeTranscript(ctx);
  const merged: ExtractContext = { ...ctx, transcript, imageDataUrl: images[0] };

  const unified = await tryUnifiedExtract(merged, "combined");
  if (unified) return unified;

  if (images.length && transcript) {
    const primary = images[0];
    if (isAiProxyAvailable() && primary) {
      const remote = await apiExtractCombined({
        imageDataUrl: primary,
        imageDataUrls: images.length > 1 ? images : undefined,
        text: transcript,
        extraContext: ctx.extraContext,
        userCity: city,
        contact,
      });
      if (remote) return remote;
    }

    if (hasOpenAiKey() && primary) {
      try {
        const { extractCombinedOpenAI } = await import("@/lib/openai");
        return await extractCombinedOpenAI(
          images.length > 1 ? images : primary,
          transcript,
          city,
          contact,
          ctx.extraContext
        );
      } catch (e) {
        console.warn("[Vauto] OpenAI combined extract failed, using sequential:", e);
      }
    }

    const fromImage = await extractFromImage(merged);
    const fromText = await extractFromText(merged);
    return {
      ...fromImage,
      title: fromText.title || fromImage.title,
      price: fromText.price > 0 ? fromText.price : fromImage.price,
      location: fromText.location || fromImage.location,
      confidence: Math.max(fromImage.confidence, fromText.confidence) * 0.95,
    };
  }
  if (images.length) return extractFromImage(merged);
  if (transcript) return extractFromText(merged);
  throw new Error("Nėra duomenų apdorojimui");
}
