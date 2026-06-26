import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export default function PrivatumasPage() {
  return (
    <LegalDocumentShell title="Privatumo politika (BDAR)" updated="2026-06-24">
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">1. Duomenų valdytojas</h2>
        <p>
          VAUTO platforma (vauto.lt / vauto-chi.vercel.app) tvarko asmens duomenis pagal
          Bendrąjį duomenų apsaugos reglamentą (BDAR) ir LR įstatymus. Platforma veikia
          nacionaliniu mastu — visoje Lietuvoje.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">2. Kokius duomenis renkame</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Paskyros duomenys: vardas, telefonas, el. paštas, miestas</li>
          <li>Skelbimų duomenys: automobilių, NT, drabužių, darbo ir paslaugų atributai</li>
          <li>B2B duomenys: įmonės pavadinimas, įmonės kodas, PVM kodas</li>
          <li>CV ir darbo paraiškų duomenys (darbdavių inbox)</li>
          <li>Mokėjimų istorija ir PVM sąskaitos-faktūros</li>
          <li>Pokalbių žinutės ir push pranešimų metaduomenys</li>
        </ul>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">3. Teisinis pagrindas ir tikslai</h2>
        <p>
          Duomenis tvarkome sutarties vykdymui (skelbimų publikavimas, mokėjimai), teisėtu
          interesui (saugumas, moderacija) ir jūsų sutikimu (marketingas, push pranešimai).
          AI importas apdoroja viešai prieinamą skelbimų informaciją tik jūsų užklausa.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">4. Saugojimas ir teisės</h2>
        <p>
          Duomenys saugomi ES infrastruktūroje su šifravimu perduodant. Turite teisę
          susipažinti, ištaisyti, ištrinti duomenis ir apriboti tvarkymą — kreipkitės per
          Platformos palaikymo skiltį. Sesijos duomenys saugomi įrenginyje persistent login
          režimui; atsijungus profilis išvalomas.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">5. Slapukai ir trečiosios šalys</h2>
        <p>
          Naudojame būtinus slapukus ir localStorage sesijai. Mokėjimams gali būti naudojami
          Stripe ar bankų tiekėjai. Push pranešimams — Google FCM / Apple APNs (mobilioje
          programėlėje). Referalinės nuorodos apdorojamos be PII perdavimo tretiesiems asmenims.
        </p>
      </section>
    </LegalDocumentShell>
  );
}
