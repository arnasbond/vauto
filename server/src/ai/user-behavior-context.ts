export interface UserBehaviorEventPayload {
  type: string;
  at: number;
  payload?: Record<string, unknown>;
}

export function buildUserBehaviorContextBlock(
  events?: UserBehaviorEventPayload[] | null
): string {
  if (!events?.length) return "";

  const lines = events.slice(-15).map((e) => {
    const payload = e.payload ? JSON.stringify(e.payload) : "{}";
    return `- [${e.type}] ${payload}`;
  });

  return `[Vartotojo elgsena — paskutiniai ${lines.length} veiksmai]
${lines.join("\n")}

ELGSENOS INTERPRETACIJOS TAISYKLĖS:
- Naują užklausą interpretuok per šią elgsenos istoriją, ne aklai pagal paskutinį sakinį.
- Jei matoma page_view /fashion arba theme_change wardrobe / spinta_enter — prioritetas VAUTO Spinta (Drabužiai, mados kontekstas).
- Jei search_empty — pasiūlyk pagalbą, patikslink filtrus (updateUIFilters) arba searchListings su išplėstu query.
- Klaidingai ištartus ar trumpus žodžius Spintos režime koreguok per updateUIFilters (category clothing + subcategory), ne searchListings.`;
}
