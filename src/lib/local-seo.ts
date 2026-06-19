/** Hot local search terms for Panevėžys empty-state discovery */
export const PANEVEZYS_HOT_KEYWORDS = [
  { label: "Automobilių remontas", query: "automobilių remontas Panevėžys" },
  { label: "Žolės pjovimas", query: "žolės pjovimas" },
  { label: "Dviratis", query: "dviratis Panevėžys" },
  { label: "Meistras", query: "meistras remontas" },
  { label: "Mobilus telefonas", query: "mobilus telefonas" },
  { label: "Darbas", query: "darbas Panevėžys" },
  { label: "Automobilis", query: "automobilis" },
  { label: "Baldai", query: "baldai" },
] as const;

export function regionalizeTitle(title: string, location: string): string {
  const city = location.split(",")[0]?.trim() || "Panevėžys";
  const lower = title.toLowerCase();
  if (lower.includes(city.toLowerCase())) return title;
  return `${title} ${city}`;
}
