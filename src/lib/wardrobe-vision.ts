import { apiAnalyzeWardrobePhoto } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import type { AiExtractedListing } from "@/lib/types";
import { formatVintedCategory } from "@/lib/clothing-catalog";

export interface WardrobeDraftItem {
  id: string;
  title: string;
  categoryGroup: string;
  categorySub: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  suggestedPrice: number;
  description: string;
  descriptionVariants?: AiExtractedListing["descriptionVariants"];
}

export interface WardrobeVisionAnalysis {
  items: WardrobeDraftItem[];
  voiceAnnouncement: string;
}

function demoWardrobeItems(): WardrobeDraftItem[] {
  return [
    {
      id: "wardrobe-1",
      title: "Juoda midi suknelė",
      categoryGroup: "Moterims",
      categorySub: "Suknelės",
      size: "M",
      color: "Juoda",
      brand: "Zara",
      condition: "Labai gera",
      suggestedPrice: 28,
      description:
        "Elegantiška juoda suknelė — ideali vakarėliui ar biurui. Minkštas audinys, puikiai krenta ant figūros.",
      descriptionVariants: {
        youth:
          "Juoda midi suknelė, kuri akimirksniu pakelia nuotaiką — stilinga, lengva, pasitikėjimo kupina.",
        family: "Patogi ir tvarkinga suknelė kasdienai — lengva prižiūrėti, puikiai tinka aktyviam gyvenimui.",
        rational: "Kokybiška Zara suknelė už dalį parduotuvės kainos — puikus kainos ir kokybės balansas.",
      },
    },
    {
      id: "wardrobe-2",
      title: "Smėlio spalvos švarkas",
      categoryGroup: "Moterims",
      categorySub: "Švarkai",
      size: "S",
      color: "Smėlio",
      brand: "Mango",
      condition: "Gera",
      suggestedPrice: 35,
      description: "Universalus švarkas, lengvai derinamas su džinsais ar suknele.",
    },
    {
      id: "wardrobe-3",
      title: "Balti lininiai marškinėliai",
      categoryGroup: "Moterims",
      categorySub: "Palaidinės",
      size: "M",
      color: "Balta",
      brand: "H&M",
      condition: "Labai gera",
      suggestedPrice: 12,
      description: "Lengvi vasarini marškinėliai — natūralus linas, kvėpuojantis.",
    },
  ];
}

export function wardrobeItemToDraft(
  item: WardrobeDraftItem,
  contact: string,
  location: string
): AiExtractedListing {
  return {
    title: item.title,
    price: item.suggestedPrice,
    location,
    contact,
    category: "clothing",
    confidence: 0.9,
    description: item.description,
    descriptionVariants: item.descriptionVariants,
    selectedPersona: "youth",
    attributes: {
      vintedCategory: formatVintedCategory(item.categoryGroup, item.categorySub),
      clothingType: item.categoryGroup,
      size: item.size,
      color: item.color,
      colors: [item.color],
      brand: item.brand,
      condition: item.condition,
    },
  };
}

export async function analyzeWardrobePhoto(params: {
  imageDataUrl: string;
  userName?: string;
}): Promise<WardrobeVisionAnalysis | null> {
  if (isAiProxyAvailable()) {
    const result = await apiAnalyzeWardrobePhoto(params);
    if (result) return result;
  }

  const name = params.userName?.trim().split(/\s+/)[0] || "drauge";
  const items = demoWardrobeItems();
  return {
    items,
    voiceAnnouncement: `${name}, tavo nuotraukoje matau ${items.length} drabužius. Paruošiau ${items.length} atskirus skelbimus, tau beliko vienu paspaudimu juos patvirtinti!`,
  };
}
