/** Hot search terms for Lithuania-wide discovery */
export const LITHUANIA_HOT_KEYWORDS = [
  { label: "Butas", query: "2 kambarių butas Vilnius" },
  { label: "Paslaugos", query: "meistras remontas" },
  { label: "Elektronika", query: "MacBook telefonas" },
  { label: "Darbas", query: "darbas Vilnius Kaunas Klaipėda" },
  { label: "Namai ir buitis", query: "baldai žolės pjovimas" },
  { label: "Transportas", query: "transportas nuoma" },
  { label: "Mobilus telefonas", query: "mobilus telefonas" },
  { label: "Dviratis", query: "dviratis Lietuva" },
] as const;

export const PANEVEZYS_HOT_KEYWORDS = LITHUANIA_HOT_KEYWORDS;

export function regionalizeTitle(title: string, location: string): string {
  const city = location.split(",")[0]?.trim() || "Lietuva";
  const lower = title.toLowerCase();
  if (lower.includes(city.toLowerCase())) return title;
  return `${title} ${city}`;
}
