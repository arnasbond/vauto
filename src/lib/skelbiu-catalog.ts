/** Skelbiu.lt gilieji laukai — elektronika, baldai, statyba, paslaugos. */

export const SKELBIU_TOP_CATEGORIES = [
  "Elektronika",
  "Buitis",
  "Statyba",
  "Paslaugos",
  "Grožis / Sveikata",
  "Pramogos",
] as const;

export const ELECTRONICS_MANUFACTURERS = [
  "Apple",
  "Samsung",
  "Sony",
  "Huawei",
  "Xiaomi",
  "LG",
  "Philips",
  "Lenovo",
  "HP",
  "Dell",
  "Asus",
  "Kita",
] as const;

export const STORAGE_CAPACITIES = [
  "32 GB",
  "64 GB",
  "128 GB",
  "256 GB",
  "512 GB",
  "1 TB",
  "2 TB+",
] as const;

export const DEVICE_OS = ["iOS", "Android", "Windows", "macOS", "Linux", "Kita"] as const;

export const WARRANTY_OPTIONS = ["Yra", "Nėra"] as const;

export const FURNITURE_TYPES = [
  "Minkšti baldai",
  "Lovos",
  "Stalai",
  "Spintos",
  "Kėdės",
  "Komodos",
  "Kita",
] as const;

export const FURNITURE_MATERIALS = [
  "Medis",
  "Metalas",
  "Plastikas",
  "Oda / Audinys",
  "Stiklas",
  "Kita",
] as const;

export const ITEM_CONDITIONS_SKELBIU = ["Naujas", "Naudotas"] as const;

export const CONSTRUCTION_TOOL_TYPES = [
  "Elektriniai įrankiai",
  "Sodo technika",
  "Statybinės medžiagos",
  "Rankiniai įrankiai",
  "Kita",
] as const;

export const POWER_SOURCE_TYPES = [
  "Akumuliatorinis",
  "Laidinis",
  "Benzininis",
  "Kita",
] as const;

export type SkelbiuFieldProfile = "electronics" | "furniture" | "construction" | "generic";

export function getSkelbiuFieldProfile(categoryPath: string): SkelbiuFieldProfile {
  const t = categoryPath.toLowerCase();
  if (/elektronik|telefon|kompiuter|televiz|garso|buitin/.test(t)) return "electronics";
  if (/bald|buitis|lov|stal|spint|virtuv/.test(t)) return "furniture";
  if (/statyb|įrank|sod|darž|medžiag/.test(t)) return "construction";
  return "generic";
}

export function skelbiuTopCategory(categoryPath: string): string {
  return categoryPath.split("›")[0]?.trim() ?? "";
}
