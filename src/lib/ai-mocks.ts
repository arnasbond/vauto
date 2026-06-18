import type { AiExtractedListing, ListingCategory } from "@/lib/types";

/**
 * Mock multimodal extraction — simulates GPT-4o vision + text understanding.
 * Swap the body of this function with a real OpenAI API call in production.
 *
 * @example
 * const res = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: [{ type: "image_url", ... }, { type: "text", text: prompt }] }],
 * });
 */
export async function mockExtractFromImage(
  _fileName?: string
): Promise<AiExtractedListing> {
  await delay(100);

  return {
    title: "Naudotas iPhone 12 — ekranas be įbrėžimų",
    price: 280,
    location: "Panevėžys",
    contact: "+370 612 34567",
    category: "electronics",
    confidence: 0.92,
  };
}

/**
 * Mock speech-to-text + NLU extraction — simulates Whisper + GPT pipeline.
 * Replace with: whisper.transcriptions.create() → gpt-4o structured output.
 */
export async function mockExtractFromVoice(
  transcript?: string
): Promise<AiExtractedListing> {
  await delay(100);
  return parseTranscript(transcript ?? "Parduodu maišą obuolių, dešimt eurų, Panevėžyje");
}

export async function mockExtractFromText(
  text: string
): Promise<AiExtractedListing> {
  await delay(100);
  if (!text.trim()) {
    return {
      title: "Skelbimas",
      price: 0,
      location: "Panevėžys",
      contact: "+370 612 34567",
      category: "other",
      confidence: 0.5,
    };
  }
  return parseTranscript(text);
}

function parseTranscript(text: string): AiExtractedListing {
  // Simple Lithuanian price parsing: "dešimt eurų" → 10€
  let price = 10;
  if (/penkiolika|15/i.test(text)) price = 15;
  if (/dvidešimt|20/i.test(text)) price = 20;
  if (/šimt|100/i.test(text)) price = 100;

  let category: ListingCategory = "other";
  if (/obuol|maiš|daržov/i.test(text)) category = "home";
  if (/telefon|iphone/i.test(text)) category = "electronics";
  if (/žol|pjov/i.test(text)) category = "services";

  const locationMatch = text.match(
    /(Vilnius|Kaunas|Panevėžys|Klaipėda|Šiauliai)/i
  );

  return {
    title: extractTitleFromTranscript(text),
    price,
    location: locationMatch?.[1] ?? "Panevėžys",
    contact: "+370 612 34567",
    category,
    confidence: 0.87,
  };
}

/** Mock Whisper transcription */
export async function mockTranscribeAudio(_blob?: Blob): Promise<string> {
  await delay(800);
  return "Parduodu maišą obuolių, dešimt eurų, Panevėžyje. Skambinkite.";
}

function extractTitleFromTranscript(text: string): string {
  if (/obuol/i.test(text)) return "Maišas obuolių — švieži";
  if (/žol/i.test(text)) return "Žolės pjovimo paslauga";
  if (/telefon/i.test(text)) return "Mobilus telefonas";
  return text.slice(0, 60);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
