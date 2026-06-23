import {
  mockExtractFromImage,
  mockExtractFromText,
  mockExtractFromVoice,
} from "@/lib/ai-mocks";
import { apiExtractImage, apiExtractText } from "@/lib/api/client";
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
  fileName?: string;
  transcript?: string;
  userCity?: string;
  contact?: string;
}

export async function extractFromImage(
  ctx: ExtractContext = {}
): Promise<AiExtractedListing> {
  const contact = ctx.contact ?? "+370 612 34567";
  const city = ctx.userCity ?? "Lietuva";

  if (isAiProxyAvailable() && ctx.imageDataUrl) {
    const remote = await apiExtractImage({
      imageDataUrl: ctx.imageDataUrl,
      userCity: city,
      contact,
    });
    if (remote) return remote;
  }

  if (hasOpenAiKey() && ctx.imageDataUrl) {
    try {
      return await extractFromImageOpenAI(ctx.imageDataUrl, city, contact);
    } catch (e) {
      console.warn("[Vauto] OpenAI vision failed, using mock:", e);
    }
  }

  return mockExtractFromImage(ctx.fileName, ctx.imageDataUrl ?? undefined);
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
  if (ctx.imageDataUrl && ctx.transcript?.trim()) {
    const fromImage = await extractFromImage(ctx);
    const fromText = await extractFromText(ctx);
    return {
      ...fromImage,
      title: fromText.title || fromImage.title,
      price: fromText.price > 0 ? fromText.price : fromImage.price,
      location: fromText.location || fromImage.location,
      confidence: Math.max(fromImage.confidence, fromText.confidence) * 0.95,
    };
  }
  if (ctx.imageDataUrl) return extractFromImage(ctx);
  if (ctx.transcript?.trim()) return extractFromText(ctx);
  throw new Error("Nėra duomenų apdorojimui");
}
