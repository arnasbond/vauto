import { apiImportWardrobeProfile } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { formatVintedCategory } from "@/lib/clothing-catalog";
import type { AiExtractedListing } from "@/lib/types";

export interface WardrobeProfileImportItem {
  id: string;
  title: string;
  price: number;
  category: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  description: string;
  imageUrl?: string;
  location?: string;
}

export interface WardrobeProfileImport {
  profileUrl: string;
  sellerDisplayName?: string;
  items: WardrobeProfileImportItem[];
  voiceAnnouncement: string;
}

export function isWardrobeProfileUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (
      /vinted\.(lt|com|fr|de|pl|it|es|nl|be|at|cz|sk|hu|ro|gr|hr|fi|dk|se|no|co\.uk|com\.ua)$/i.test(
        u.hostname
      ) && /\/member(s)?\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function profileItemToDraft(
  item: WardrobeProfileImportItem,
  contact: string,
  defaultLocation: string
): AiExtractedListing {
  const group = "Moterims";
  return {
    title: item.title,
    price: item.price,
    location: item.location?.trim() || defaultLocation,
    contact,
    category: "clothing",
    confidence: 0.88,
    description: item.description,
    attributes: {
      vintedCategory: formatVintedCategory(group, item.category),
      clothingType: group,
      size: item.size,
      color: item.color,
      colors: [item.color],
      brand: item.brand,
      condition: item.condition,
      _importProfileUrl: item.id,
    },
  };
}

function demoImport(profileUrl: string, userName?: string, defaultLocation?: string): WardrobeProfileImport {
  const first = userName?.trim().split(/\s+/)[0] || "drauge";
  const loc = defaultLocation?.trim() || "";
  const items: WardrobeProfileImportItem[] = [
    {
      id: "import-1",
      title: "Vilnonis megztinis",
      price: 22,
      category: "Megztiniai",
      size: "M",
      color: "Kreminė",
      brand: "COS",
      condition: "Labai gera",
      description: "Minkštas vilnonis megztinis — lengvas ir universalus.",
      location: loc || undefined,
    },
    {
      id: "import-2",
      title: "Platus sijonas",
      price: 18,
      category: "Sijonai",
      size: "S",
      color: "Ruda",
      brand: "Mango",
      condition: "Gera",
      description: "Platus midi sijonas kasdienai.",
      location: loc || undefined,
    },
    {
      id: "import-3",
      title: "Lininiai marškinėliai",
      price: 14,
      category: "Palaidinės",
      size: "M",
      color: "Balta",
      brand: "H&M",
      condition: "Labai gera",
      description: "Natūralus linas — vasarai.",
      location: loc || undefined,
    },
  ];
  return {
    profileUrl,
    items,
    voiceAnnouncement: `${first}, paruošiau ${items.length} skelbimus iš tavo spintos — peržiūrėk ir patvirtink vienu paspaudimu!`,
  };
}

export async function importWardrobeProfile(params: {
  profileUrl: string;
  userName?: string;
  defaultLocation?: string;
  contact?: string;
}): Promise<WardrobeProfileImport | null> {
  if (isAiProxyAvailable()) {
    const remote = await apiImportWardrobeProfile({
      profileUrl: params.profileUrl,
      userName: params.userName,
      defaultLocation: params.defaultLocation,
    });
    if (remote) return remote;
  }
  if (!isWardrobeProfileUrl(params.profileUrl)) return null;
  return demoImport(params.profileUrl, params.userName, params.defaultLocation);
}
