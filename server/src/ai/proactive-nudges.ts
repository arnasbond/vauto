import {
  getRecentUserBehaviorEvents,
  getUserPreferences,
  shouldFireUserNudge,
  markUserNudgeFired,
  getActiveUserRequirements,
  getSavedIds,
  searchListingsFiltered,
} from "../repository.js";

export interface ProactiveNudge {
  key: string;
  message: string;
  quickReplies?: string[];
}

export async function buildProactiveNudgesForUser(
  userId: string
): Promise<ProactiveNudge[]> {
  const nudges: ProactiveNudge[] = [];
  const prefs = await getUserPreferences(userId);
  const events = await getRecentUserBehaviorEvents(userId, 20);

  const lastSearch = [...events]
    .reverse()
    .find((e) => e.type === "search_empty" || e.type === "page_view");

  const searchQuery =
    (lastSearch?.payload?.query as string | undefined) ??
    (lastSearch?.payload?.searchQuery as string | undefined) ??
    prefs?.preferredCategories?.[0];

  if (searchQuery && typeof searchQuery === "string" && searchQuery.trim().length >= 2) {
    const key = `new_matches:${searchQuery.trim().toLowerCase()}`;
    if (await shouldFireUserNudge(userId, key, 24 * 60 * 60 * 1000)) {
      const matches = await searchListingsFiltered({
        query: searchQuery.trim(),
        limit: 5,
      });
      if (matches.length > 0) {
        nudges.push({
          key,
          message: `Matau, anksčiau žiūrėjote „${searchQuery}" — dabar radau ${matches.length} naujų atitikmenų. Ar parodyti?`,
          quickReplies: ["Taip, parodyti", "Ne, ačiū"],
        });
        await markUserNudgeFired(userId, key, { query: searchQuery, count: matches.length });
      }
    }
  }

  const size = prefs?.preferredSizes?.[0];
  if (size) {
    const key = `size_pref:${size}`;
    if (await shouldFireUserNudge(userId, key, 7 * 24 * 60 * 60 * 1000)) {
      nudges.push({
        key,
        message: `Prisimenu, dažnai ieškote ${size} dydžio drabužių — norite, kad parodyčiau naujausius?`,
        quickReplies: ["Taip", "Vėliau"],
      });
      await markUserNudgeFired(userId, key, { size });
    }
  }

  const requirements = (await getActiveUserRequirements()).filter(
    (r) => r.userId === userId
  );
  if (requirements.length > 0) {
    const req = requirements[0]!;
    const key = `requirement:${req.id}`;
    if (await shouldFireUserNudge(userId, key, 12 * 60 * 60 * 1000)) {
      nudges.push({
        key,
        message: `Jūsų noras „${req.query}" vis dar aktyvus — galiu patikslinti paiešką ar pranešti, kai atsiras naujas skelbimas.`,
        quickReplies: ["Patikslinti", "Palikti kaip yra"],
      });
      await markUserNudgeFired(userId, key, { requirementId: req.id });
    }
  }

  const saved = await getSavedIds(userId);
  if (saved.length > 0) {
    const key = "saved_listings_reminder";
    if (await shouldFireUserNudge(userId, key, 3 * 24 * 60 * 60 * 1000)) {
      nudges.push({
        key,
        message: `Turite ${saved.length} išsaugotų skelbimų — norite grįžti prie jų dabar?`,
        quickReplies: ["Atidaryti mėgstamiausius", "Ne dabar"],
      });
      await markUserNudgeFired(userId, key, { count: saved.length });
    }
  }

  return nudges.slice(0, 2);
}
