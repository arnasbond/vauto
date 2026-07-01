import { visionExtractJson } from "../../../ai/llm-provider.js";
import type { DamageDetectionResult, DamageFinding, VisualPipelineImageInput } from "../types.js";

const DAMAGE_SCHEMA = `{
  "findings": [
    {
      "type": "scratch|dent|crack|wear|rust|stain|other",
      "severity": "minor|moderate|major",
      "locationHint": "string",
      "confidence": 0.0,
      "includeInDescriptionSuggested": true
    }
  ],
  "conditionHint": "string — lietuviškai, trumpai",
  "hasVisibleDefects": false,
  "assistantPrompt": "string — mandagus klausimas pardavėjui lietuviškai"
}`;

const DAMAGE_VISION_PROMPT = `Tu esi VAUTO būklės inspektorius. Įvertink NUOTRAUKOSE matomą fizinę būklę (įbrėžimai, įskilimai, nusidėvėjimas, rūdys, dėmės).
NIEKADA nehallucinuok defektų — tik tai, ką aiškiai matai.
Jei defektų nematai — findings: [], hasVisibleDefects: false.
Jei matai — hasVisibleDefects: true ir assistantPrompt: mandagus klausimas, pvz. „Pastebėjau galimus įbrėžimus — ar norite, kad įtraukčiau tai į aprašymą?“
Grąžink JSON: ${DAMAGE_SCHEMA}`;

export async function runDamageDetection(
  images: VisualPipelineImageInput[],
  ctx: { category?: string; title?: string }
): Promise<DamageDetectionResult> {
  const urls = images.map((i) => i.processedUrl ?? i.sourceUrl).slice(0, 6);
  if (!urls.length) {
    return {
      findings: [],
      conditionHint: "",
      hasVisibleDefects: false,
    };
  }

  try {
    const raw = await visionExtractJson(
      `${DAMAGE_VISION_PROMPT}\nKategorija: ${ctx.category ?? "other"}\nPavadinimas: ${ctx.title ?? ""}`,
      urls
    );

    const findings: DamageFinding[] = Array.isArray(raw.findings)
      ? raw.findings
          .map((f: Record<string, unknown>) => ({
            type: String(f.type ?? "other") as DamageFinding["type"],
            severity: String(f.severity ?? "minor") as DamageFinding["severity"],
            locationHint: String(f.locationHint ?? "").trim(),
            confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.5)),
            includeInDescriptionSuggested: f.includeInDescriptionSuggested !== false,
          }))
          .filter((f) => f.locationHint || f.type !== "other")
      : [];

    const hasVisibleDefects =
      Boolean(raw.hasVisibleDefects) || findings.some((f) => f.confidence >= 0.45);

    return {
      findings,
      conditionHint: String(raw.conditionHint ?? "").trim(),
      hasVisibleDefects,
      assistantPrompt: hasVisibleDefects
        ? String(raw.assistantPrompt ?? "").trim() ||
          "Pastebėjau galimus naudojimo ženklus nuotraukose — ar norite, kad įtraukčiau tai į aprašymą?"
        : undefined,
    };
  } catch {
    return {
      findings: [],
      conditionHint: "",
      hasVisibleDefects: false,
    };
  }
}
