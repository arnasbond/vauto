import { visionExtractJson } from "../../../ai/llm-provider.js";
import type { ClassifiedPhoto, PhotoAngleTag, SmartSortResult, VisualPipelineImageInput } from "../types.js";

const ANGLE_SCHEMA = `{
  "photos": [
    { "id": "string", "angleTag": "hero_front|hero_side|hero_three_quarter|interior|detail|damage_closeup|label_sticker|document|tech_passport|receipt|other", "heroScore": 0.0 }
  ]
}`;

const HERO_SCORE_BOOST: Partial<Record<PhotoAngleTag, number>> = {
  hero_front: 0.25,
  hero_three_quarter: 0.2,
  hero_side: 0.15,
  detail: 0.05,
  interior: 0.0,
  damage_closeup: -0.1,
  label_sticker: -0.15,
  document: -1,
  tech_passport: -1,
  receipt: -1,
  other: 0.0,
};

const DOCUMENT_TAGS = new Set<PhotoAngleTag>([
  "document",
  "tech_passport",
  "receipt",
  "label_sticker",
]);

export async function runSmartSort(
  images: VisualPipelineImageInput[],
  ctx: { category?: string }
): Promise<SmartSortResult> {
  const base = images.map((img, index) => ({
    id: img.id,
    url: img.processedUrl ?? img.sourceUrl,
    angleTag: "other" as PhotoAngleTag,
    heroScore: Math.max(0, 1 - index * 0.05),
    sortIndex: index,
  }));

  if (images.length <= 1) {
    return {
      ordered: base,
      coverImageId: base[0]?.id ?? "0",
    };
  }

  try {
    const idList = images.map((i) => i.id).join(", ");
    const raw = await visionExtractJson(
      `Klasifikuok kiekvienos nuotraukos kampą/paskirtį. Kategorija: ${ctx.category ?? "other"}.
Nuotraukų id eilėje: ${idList}.
hero_front / hero_three_quarter — geriausi viršeliai.
document / tech_passport / receipt / label_sticker — dokumentai (tech passport, registracija, kvitas) — NE vieša galerija; heroScore labai žemas.
Grąžink JSON: ${ANGLE_SCHEMA}`,
      images.map((i) => i.processedUrl ?? i.sourceUrl).slice(0, 12)
    );

    const classified = new Map<string, { angleTag: PhotoAngleTag; heroScore: number }>();
    if (Array.isArray(raw.photos)) {
      for (const row of raw.photos as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (!id) continue;
        const angleTag = String(row.angleTag ?? "other") as PhotoAngleTag;
        const rawScore = Number(row.heroScore);
        const boost = HERO_SCORE_BOOST[angleTag] ?? 0;
        classified.set(id, {
          angleTag,
          heroScore: Number.isFinite(rawScore) ? rawScore + boost : 0.5 + boost,
        });
      }
    }

    const orderedAll: ClassifiedPhoto[] = base
      .map((photo) => {
        const hit = classified.get(photo.id);
        return {
          ...photo,
          angleTag: hit?.angleTag ?? photo.angleTag,
          heroScore: hit?.heroScore ?? photo.heroScore,
        };
      })
      .sort((a, b) => b.heroScore - a.heroScore)
      .map((p, sortIndex) => ({ ...p, sortIndex }));

    // Public gallery excludes document / passport / receipt photos.
    // NEVER fall back to orderedAll — that re-injects tech passport into the public set.
    const galleryOrdered = orderedAll.filter((p) => !DOCUMENT_TAGS.has(p.angleTag));

    return {
      ordered: galleryOrdered,
      coverImageId: galleryOrdered[0]?.id ?? base.find((p) => !DOCUMENT_TAGS.has(p.angleTag))?.id ?? base[0]!.id,
    };
  } catch {
    return {
      ordered: base,
      coverImageId: base[0]?.id ?? "0",
    };
  }
}
