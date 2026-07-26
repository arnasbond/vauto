/** Client-facing Safety Shield copy — keep aligned with server/src/ai/safety-shield.ts */

export const IMAGE_SAFETY_REJECT_NOTICE =
  "Nuotrauka neatitinka VAUTO saugumo taisyklių ir nebuvo įkelta.";

export const TOXIC_DEESCALATION_REPLY =
  "Laikykimės etiketo! Aš esu čia, kad padėčiau suformuoti skelbimą. Tęskime nuo prekės/paslaugos aprašymo.";

export const SAFETY_DOMAIN_REJECT_REPLY =
  "Aš esu VAUTO asistentas ir padedu tik pirkimo, pardavimo bei paslaugų klausimais.";

export const RATE_LIMIT_BUSY_REPLY =
  "Per daug užklausų, pamėginkite šiek tiek vėliau";

/** Explicit fake/replica hard-block (Smart Authenticity tier 1). */
export const REPLICA_HARD_BLOCK_REPLY =
  "VAUTO platformoje klastočių, replikų ir neoriginalių prekių pardavimas yra draudžiamas.";

/** Soft tip — stock / studio photos (never blocks). */
export const STOCK_PHOTO_ADVISORY =
  "Patarimas: skelbimai su gyvomis, tikromis prekės nuotraukomis sulaukia 2 kartus daugiau pirkėjų dėmesio!";
