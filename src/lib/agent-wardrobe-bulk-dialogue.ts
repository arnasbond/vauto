/** Agent dialogue + chips for Spinta bulk import / wardrobe transfer wizard. */

export const WARDROBE_BULK_IMPORT_GREETING =
  "Matau, kad norite atlaisvinti spintą! Atidariau jums masinio įkėlimo įrankį. Galite tiesiog įklijuoti savo profilio nuorodą viršuje arba įmesti nuotraukų krepšelį žemiau – aš viską išdėliosiu į lentynas.";

export const WARDROBE_BULK_IMPORT_CHIPS = [
  "Kaip veikia importas?",
  "Įkelti nuotraukų krepšelį",
  "Pildyti rankiniu būdu",
] as const;

export const WARDROBE_IMPORT_HOW_IT_WORKS_REPLY =
  "Importas veikia taip: 1) įklijuokite Vinted ar kitos spintos profilio nuorodą viršuje — AI paruoš skelbimus automatiškai; 2) arba įkelkite nuotraukas į krepšelį — Smart Wardrobe Vision atpažins kiekvieną drabužį; 3) peržiūrėkite juodraščius ir patvirtinkite vienu paspaudimu.";

export const WARDROBE_BULK_MANUAL_FILL_REPLY =
  "Gerai — užpildykite laukus žemiau ranka arba pasirinkite vieną drabuį iš AI sąrašo, jei jis jau paruoštas.";

export const WARDROBE_BULK_PHOTO_PICK_HINT =
  "Atidarykite nuotraukų krepšelį žemiau — vilkite failus arba paspauskite „Įkelti nuotraukų“.";

export const WARDROBE_BULK_PHOTO_PICK_EVENT = "vauto:wardrobe-bulk-pick-photos";

export function buildWardrobePhotosReceivedMessage(itemCount: number): string {
  if (itemCount <= 0) {
    return "Nuotraukas gavau — analizuoju. Jei matysiu drabužius, paruošiu juodraščius.";
  }
  if (itemCount === 1) {
    return "Nuotrauką gavau, matau vieną drabuį — ruošiu skelbimo juodraštį. Ar tęsiame?";
  }
  return `Nuotraukas gavau, matau ${itemCount} drabužius — pradedu ruošti skelbimų juodraščius. Ar tęsiame?`;
}

export function wardrobePhotosReceivedChips(itemCount: number): string[] {
  if (itemCount > 1) {
    return ["Taip, tęsti", "Redaguoti po vieną", "Įkelti kitą nuotrauką"];
  }
  return ["Taip, tęsti", "Pildyti rankiniu būdu", "Įkelti kitą nuotrauką"];
}

export function buildWardrobeProfileImportedMessage(itemCount: number): string {
  if (itemCount <= 0) {
    return "Profilį gavau — ruošiu juodraščius peržiūrai.";
  }
  if (itemCount === 1) {
    return "Profilį gavau, matau vieną prekę — paruošiau juodraštį peržiūrai. Ar tęsiame?";
  }
  return `Profilį gavau, matau ${itemCount} prekių — paruošiau juodraščius peržiūrai žemiau. Ar tęsiame?`;
}

export function wardrobeProfileImportedChips(itemCount: number): string[] {
  if (itemCount > 1) {
    return ["Taip, tęsti", "Peržiūrėti importą", "Redaguoti po vieną"];
  }
  return ["Taip, tęsti", "Pildyti rankiniu būdu", "Kaip veikia importas?"];
}

export const WARDROBE_BULK_REVIEW_EVENT = "vauto:wardrobe-bulk-scroll-review";

export function requestWardrobeBulkPhotoPick(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WARDROBE_BULK_PHOTO_PICK_EVENT));
}

export function scrollToWardrobeBulkReview(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WARDROBE_BULK_REVIEW_EVENT));
  document.getElementById("wardrobe-bulk-review")?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}
