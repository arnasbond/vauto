import {
  mockExtractFromImage,
  mockExtractFromText,
  mockExtractFromVoice,
} from "@/lib/ai-mocks";
import { apiExtractCombined, apiExtractImage, apiExtractText } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { hasOpenAiKey } from "@/lib/openai-settings";
import {
  extractFromImageOpenAI,
  extractFromTextOpenAI,
  extractFromVoiceOpenAI,
} from "@/lib/openai";
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

function resolveImages(ctx: ExtractContext): string[] {
  if (ctx.imageDataUrls?.length) return ctx.imageDataUrls;
  if (ctx.imageDataUrl) return [ctx.imageDataUrl];
  return [];
}

function mergeTranscript(ctx: ExtractContext): string | undefined {
  const parts = [ctx.transcript, ctx.extraContext].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

export async function extractFromImage(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";
  const images = resolveImages(ctx);
  const primary = images[0];

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
  const transcript =
    ctx.transcript ?? "Parduodu maišą obuolių, dešimt eurų, Lietuvoje";

  if (isAiProxyAvailable() && transcript.trim()) {
    const remote = await apiExtractText({ text: transcript, userCity: city, contact });
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
  const text = ctx.transcript ?? "";

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
  const images = resolveImages(ctx);
  const transcript = mergeTranscript(ctx);
  const merged: ExtractContext = { ...ctx, transcript, imageDataUrl: images[0] };

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
