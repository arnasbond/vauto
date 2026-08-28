import { visionExtractJson } from "../../../ai/llm-provider.js";
import {
  orderPublicListingGallery,
  parseListingPhotoClassifications,
  type ListingPhotoClassification,
} from "../../../shared/listing-gallery-order.js";
import type { ClassifiedPhoto, PhotoAngleTag, SmartSortResult, VisualPipelineImageInput } from "../types.js";

const ANGLE_SCHEMA = `{
  "photos": [
    {
      "id": "string",
      "angleTag": "hero_front|hero_side|hero_three_quarter|interior|detail|damage_closeup|label_sticker|registration_document|engine|wheels|other",
      "heroScore": 0.0
    }
  ]
}`;

const HERO_SCORE_BOOST: Partial<Record<PhotoAngleTag, number>> = {
  hero_front: 0.25,
  hero_three_quarter: 0.2,
  hero_side: 0.15,
  detail: 0.05,
  interior: -0.2,
  engine: -0.25,
  wheels: -0.22,
  damage_closeup: -0.1,
  label_sticker: -0.15,
  registration_document: -1,
  other: 0.0,
};

const ANGLE_TO_ROLE: Record<string, string> = {
  hero_front: "exterior_hero",
  hero_three_quarter: "exterior_hero",
  hero_side: "exterior",
  interior: "interior",
  detail: "detail",
  damage_closeup: "damage",
  label_sticker: "label_sticker",
  registration_document: "registration_document",
  engine: "engine",
  wheels: "wheels",
  other: "other",
};

function normalizeAngleTag(raw: unknown): PhotoAngleTag {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, PhotoAngleTag> = {
    hero_front: "hero_front",
    hero_side: "hero_side",
    hero_three_quarter: "hero_three_quarter",
    interior: "interior",
    detail: "detail",
    damage_closeup: "damage_closeup",
    label_sticker: "label_sticker",
    registration_document: "registration_document",
    tech_passport: "registration_document",
    tech_pasas: "registration_document",
    document: "registration_document",
    engine: "engine",
    wheels: "wheels",
    other: "other",
  };
  return aliases[key] ?? "other";
}

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
    const only = base[0];
    if (only) {
      // Still classify single image when possible so tech-pasas alone is not a cover.
      try {
        const raw = await visionExtractJson(
          `Klasifikuok nuotrauką. Jei tai registracijos liudijimas / tech pasas / dokumentas — angleTag=registration_document.
Jei visas automobilio eksterjeras — hero_front|hero_three_quarter|hero_side.
Grąžink JSON: ${ANGLE_SCHEMA}`,
          [only.url]
        );
        if (Array.isArray(raw.photos) && raw.photos[0]) {
          const row = raw.photos[0] as Record<string, unknown>;
          const angleTag = normalizeAngleTag(row.angleTag);
          const rawScore = Number(row.heroScore);
          const boost = HERO_SCORE_BOOST[angleTag] ?? 0;
          only.angleTag = angleTag;
          only.heroScore = Number.isFinite(rawScore) ? rawScore + boost : 0.5 + boost;
        }
      } catch {
        /* keep default */
      }
    }

    const galleryUrls = orderPublicListingGallery(
      base.map((p) => p.url),
      base.map((p, index) => ({
        index,
        role: (ANGLE_TO_ROLE[p.angleTag] ?? "other") as ListingPhotoClassification["role"],
        heroScore: p.heroScore,
      }))
    );
    const cover =
      base.find((p) => galleryUrls[0] === p.url) ??
      (galleryUrls.length ? base[0] : undefined);

    return {
      ordered: galleryUrls.length
        ? galleryUrls.map((url, sortIndex) => {
            const hit = base.find((p) => p.url === url)!;
            return { ...hit, sortIndex };
          })
        : [],
      coverImageId: cover?.id ?? "",
    };
  }

  try {
    const idList = images.map((i) => i.id).join(", ");
    const raw = await visionExtractJson(
      `Klasifikuok kiekvienos nuotraukos kampą/paskirtį pardavimo galerijoje. Kategorija: ${ctx.category ?? "other"}.
Nuotraukų id eilėje: ${idList}.

GRIEŽTOS TAISYKLĖS:
- registration_document — registracijos liudijimas, tech pasas, techninis pasas, dokumentas su VIN/valst. numeriu. ŠIOS NUOTRAUKOS NĖRA galerijai.
- hero_front / hero_three_quarter — geriausi VIRŠELIAI (pilnas automobilio eksterjeras).
- interior, engine, wheels, detail — NIEKADA neskirk aukščiausio heroScore jei yra bent vienas eksterjero vaizdas.
- cover (aukščiausias heroScore tarp viešų) PRIVALO būti pilnas eksterjeras, kai toks yra.

Grąžink JSON: ${ANGLE_SCHEMA}`,
      images.map((i) => i.processedUrl ?? i.sourceUrl).slice(0, 12)
    );

    const classified = new Map<string, { angleTag: PhotoAngleTag; heroScore: number }>();
    if (Array.isArray(raw.photos)) {
      for (const row of raw.photos as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (!id) continue;
        const angleTag = normalizeAngleTag(row.angleTag);
        const rawScore = Number(row.heroScore);
        const boost = HERO_SCORE_BOOST[angleTag] ?? 0;
        classified.set(id, {
          angleTag,
          heroScore: Number.isFinite(rawScore) ? rawScore + boost : 0.5 + boost,
        });
      }
    }

    const withTags: ClassifiedPhoto[] = base.map((photo) => {
      const hit = classified.get(photo.id);
      return {
        ...photo,
        angleTag: hit?.angleTag ?? photo.angleTag,
        heroScore: hit?.heroScore ?? photo.heroScore,
      };
    });

    const classifications: ListingPhotoClassification[] = withTags.map((p, index) => ({
      index,
      role: (ANGLE_TO_ROLE[p.angleTag] ?? "other") as ListingPhotoClassification["role"],
      heroScore: p.heroScore,
    }));

    const galleryUrls = orderPublicListingGallery(
      withTags.map((p) => p.url),
      classifications.length ? classifications : parseListingPhotoClassifications(null)
    );

    const ordered: ClassifiedPhoto[] = galleryUrls.map((url, sortIndex) => {
      const hit = withTags.find((p) => p.url === url)!;
      return { ...hit, sortIndex };
    });

    return {
      ordered,
      coverImageId: ordered[0]?.id ?? "",
    };
  } catch {
    return {
      ordered: base,
      coverImageId: base[0]?.id ?? "0",
    };
  }
}
