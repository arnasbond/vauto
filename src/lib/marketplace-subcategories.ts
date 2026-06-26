import type { ListingCategory } from "@/lib/types";

export interface MarketplaceSubcategory {
  label: string;
  query: string;
}

export interface MarketplaceCategoryDef {
  id: ListingCategory;
  label: string;
  subcategories: MarketplaceSubcategory[];
}

export const MARKETPLACE_CATEGORY_TREE: MarketplaceCategoryDef[] = [
  {
    id: "vehicles",
    label: "Auto",
    subcategories: [
      { label: "Lengvieji automobiliai", query: "automobilis" },
      { label: "Motociklai", query: "motociklas" },
      { label: "Autobusai / furgonai", query: "furgonas autobusas" },
      { label: "Dalys ir aksesuarai", query: "auto dalys ratlankiai padangos" },
    ],
  },
  {
    id: "electronics",
    label: "Elektronika",
    subcategories: [
      { label: "Telefonai", query: "telefonas iphone samsung" },
      { label: "Kompiuteriai", query: "nešiojamas kompiuteris laptop" },
      { label: "TV ir audio", query: "televizorius kolonėlės" },
      { label: "Foto / video", query: "kamera fotoaparatas" },
    ],
  },
  {
    id: "home",
    label: "Namai",
    subcategories: [
      { label: "Baldai", query: "baldai sofa stalas" },
      { label: "Virtuvė", query: "virtuvės technika indai" },
      { label: "Sodas / daržas", query: "sodo įrankiai augalai" },
      { label: "Interjeras", query: "dekoras interjeras" },
    ],
  },
  {
    id: "clothing",
    label: "Drabužiai",
    subcategories: [
      { label: "Moterims", query: "drabužiai moterims" },
      { label: "Vyrams", query: "drabužiai vyrams" },
      { label: "Vaikams", query: "drabužiai vaikams" },
      { label: "Batai", query: "batai kedai" },
    ],
  },
  {
    id: "services",
    label: "Paslaugos",
    subcategories: [
      { label: "Remontas", query: "remontas meistras" },
      { label: "Valymas", query: "valymo paslaugos" },
      { label: "Grožis", query: "grožio paslaugos" },
      { label: "Transportas", query: "pervežimo paslaugos" },
    ],
  },
  {
    id: "real_estate",
    label: "NT",
    subcategories: [
      { label: "Butai", query: "butas parduodamas" },
      { label: "Namai", query: "namas parduodamas" },
      { label: "Nuoma", query: "butas nuoma" },
      { label: "Sklypai", query: "sklypas parduodamas" },
    ],
  },
  {
    id: "jobs",
    label: "Darbas",
    subcategories: [
      { label: "Pilnas etatas", query: "darbas pilnas etatas" },
      { label: "Puse etato", query: "darbas puse etato" },
      { label: "Laikinas", query: "laikinas darbas" },
      { label: "Nuotolinis", query: "nuotolinis darbas" },
    ],
  },
  {
    id: "other",
    label: "Kita",
    subcategories: [
      { label: "Sportas", query: "sporto prekės" },
      { label: "Knygos", query: "knygos" },
      { label: "Vaikams", query: "žaislai vaikams" },
      { label: "Kolekcijos", query: "kolekcija antikvaratas" },
    ],
  },
];
