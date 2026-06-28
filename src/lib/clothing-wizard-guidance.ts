import { getFirstName } from "@/lib/buddy-voice";

export type ClothingWizardField =
  | "photo"
  | "title"
  | "category"
  | "size"
  | "brand"
  | "condition"
  | "colors"
  | "price";

export interface ClothingWizardProgress {
  userName?: string;
  hasPhoto: boolean;
  title: string;
  categoryValue: string;
  size: string;
  brand: string;
  condition: string;
  colorCount: number;
  price: number;
}

export function firstMissingClothingField(
  progress: ClothingWizardProgress
): ClothingWizardField | null {
  if (!progress.hasPhoto) return "photo";
  if (progress.title.trim().length < 2) return "title";
  if (!progress.categoryValue.trim()) return "category";
  if (!progress.size.trim()) return "size";
  if (!progress.brand.trim()) return "brand";
  if (!progress.condition.trim()) return "condition";
  if (progress.colorCount === 0) return "colors";
  if (progress.price <= 0) return "price";
  return null;
}

export function buildClothingWizardHint(progress: ClothingWizardProgress): string | null {
  const missing = firstMissingClothingField(progress);
  if (!missing) return null;

  const name = progress.userName?.trim()
    ? getFirstName(progress.userName)
    : "drauge";
  const titleSnippet = progress.title.trim() || "prekė";

  switch (missing) {
    case "photo":
      return null;
    case "title":
      return `${name}, trumpas pavadinimas padės greičiau rasti tavo skelbimą.`;
    case "category":
      return `${name}, pasirinkime kategoriją — taip prekė atsidurs tinkamoje spintoje.`;
    case "size":
      return `${name}, ${titleSnippet} atrodo puikiai! Pasirinkime dydį, kad pirkėjos iškart matytų.`;
    case "brand":
      return `${name}, prekės ženklas padeda pirkėjoms pasitikėti — net jei tai „Kita“.`;
    case "condition":
      return `${name}, aprašykime būklę švelniai ir aiškiai — tai labai svarbu drabužiams.`;
    case "colors":
      return `${name}, pasirinkime spalvą — net viena spalva užtenka pradžiai.`;
    case "price":
      return `${name}, nurodykime kainą — gali pradėti nuo simbolinės sumos ir pakoreguoti vėliau.`;
    default:
      return null;
  }
}

export function isClothingWizardReady(progress: ClothingWizardProgress): boolean {
  return firstMissingClothingField(progress) === null;
}
