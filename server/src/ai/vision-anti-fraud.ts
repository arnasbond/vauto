import { unifiedLlmJson } from "./llm-provider.js";

export interface AntiFraudResult {
  isVerified: boolean;
  requiresReview: boolean;
  riskScore: number;
  reasons: string[];
  userNotice: string;
}

const SAFE_DEFAULT: AntiFraudResult = {
  isVerified: true,
  requiresReview: false,
  riskScore: 0,
  reasons: [],
  userNotice: "",
};

function localHeuristicFraudCheck(imageCount: number): AntiFraudResult {
  if (imageCount < 1) {
    return {
      isVerified: false,
      requiresReview: true,
      riskScore: 40,
      reasons: ["missing_image"],
      userNotice:
        "Pridėkite bent vieną realią nuotrauką — be jos skelbimas negali būti patvirtintas.",
    };
  }
  return SAFE_DEFAULT;
}

/**
 * Vision Anti-Fraud Guard — aptinka stock nuotraukas, svetimus logotipus, neadekvatų turinį.
 */
export async function runVisionAntiFraudGuard(
  imageDataUrls: string[],
  listingContext?: { title?: string; category?: string }
): Promise<AntiFraudResult> {
  const local = localHeuristicFraudCheck(imageDataUrls.length);
  if (!imageDataUrls.length) return local;

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO saugumo analitikas. Įvertink ar nuotrauka tinka naudotų prekių skelbimui.
Grąžink JSON:
{"isVerified":boolean,"requiresReview":boolean,"riskScore":number,"reasons":["string"],"userNotice":"string"}
isVerified=false ir requiresReview=true jei:
- akivaizdi stock/internetinė nuotrauka be realaus daikto
- svetimi logotipai (Shutterstock, Getty, AliExpress watermark ir pan.)
- nuotrauka visiškai neadekvati skelbimui (meme, reklama, tuščias fonas)
userNotice — švelnus lietuviškas pranešimas pardavėjui patikslinti nuotraukas (be kaltinimų).
Jei nuotrauka atrodo autentiška — isVerified true, requiresReview false, riskScore 0-15.`,
      prompt: `Skelbimas: ${listingContext?.title ?? "nežinomas"}
Kategorija: ${listingContext?.category ?? "other"}
Analizuok nuotrauką(-as).`,
      imageDataUrls: imageDataUrls.slice(0, 3),
    });

    const riskScore = Math.min(100, Math.max(0, Number(raw.riskScore) || 0));
    const requiresReview = Boolean(raw.requiresReview) || riskScore >= 55;
    const isVerified = raw.isVerified !== false && !requiresReview;
    const reasons = Array.isArray(raw.reasons)
      ? raw.reasons.map(String).slice(0, 5)
      : [];
    const userNotice = String(raw.userNotice ?? "").trim();

    return {
      isVerified,
      requiresReview,
      riskScore,
      reasons,
      userNotice:
        userNotice ||
        (requiresReview
          ? "Mūsų AI pastebėjo, kad nuotrauka gali reikalauti patikslinimo. Įkelkite savo realias prekės nuotraukas — taip skelbimas greičiau pasieks pirkėjus."
          : ""),
    };
  } catch {
    return SAFE_DEFAULT;
  }
}
