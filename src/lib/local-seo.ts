/** Hot search terms for Lithuania-wide discovery */
export const LITHUANIA_HOT_KEYWORDS = [
  { label: "Automobilių remontas", query: "automobilių remontas Vilnius Kaunas" },
  { label: "Žolės pjovimas", query: "žolės pjovimas" },
  { label: "Dviratis", query: "dviratis Lietuva" },
  { label: "Meistras", query: "meistras remontas" },
  { label: "Mobilus telefonas", query: "mobilus telefonas" },
  { label: "Darbas", query: "darbas Vilnius Kaunas Klaipėda" },
  { label: "Automobilis", query: "automobilis" },
  { label: "Baldai", query: "baldai" },
] as const;

export const PANEVEZYS_HOT_KEYWORDS = LITHUANIA_HOT_KEYWORDS;

export function regionalizeTitle(title: string, location: string): string {
  const city = location.split(",")[0]?.trim() || "Lietuva";
  const lower = title.toLowerCase();
  if (lower.includes(city.toLowerCase())) return title;
  return `${title} ${city}`;
}
