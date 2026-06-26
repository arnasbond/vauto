import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export default function TaisyklesPage() {
  return (
    <LegalDocumentShell title="Naudojimosi sąlygos" updated="2026-06-24">
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">1. Bendrosios nuostatos</h2>
        <p>
          VAUTO (toliau — Platforma) yra nacionalinė skelbimų ekosistema, veikianti visoje
          Lietuvos Respublikoje. Naudodamiesi Platforma sutinkate su šiomis sąlygomis.
          Platforma apjungia automobilių, nekilnojamojo turto, drabužių, darbo skelbimų ir
          paslaugų skelbimus vienoje vietoje.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">2. Paskyros ir turinys</h2>
        <p>
          Vartotojas atsako už pateiktų skelbimų tikslumą, teisėtumą ir atitiktį LR įstatymams.
          Draudžiama skelbti neteisingą informaciją, trečiųjų šalių duomenis be sutikimo ar
          turinį, pažeidžiantį intelektinę nuosavybę. Platforma pasilieka teisę moderuoti
          ir pašalinti skelbimus.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">3. B2B paslaugos ir mokėjimai</h2>
        <p>
          Verslo paskyroms taikomi prenumeratos planai (START, GROWTH, ENTERPRISE) ir
          papildomos mokamos paslaugos (iškelimas, matomumas). Mokėjimai apdorojami per
          integruotą checkout sistemą; už kiekvieną apmokėtą paslaugą generuojama PVM
          sąskaita-faktūra, saugoma vartotojo kabinete.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">4. AI importas ir atsakomybė</h2>
        <p>
          AI skelbimų importo funkcija padeda perkelti duomenis iš kitų portalų. Vartotojas
          privalo peržiūrėti ir patvirtinti importuotus duomenis prieš publikuojant.
          Platforma neatsako už automatiškai išgautų laukų netikslumus.
        </p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">5. Taikytina teisė</h2>
        <p>
          Sąlygoms taikoma Lietuvos Respublikos teisė. Ginčai sprendžiami derybomis, o
          nepavykus — kompetentingame LR teisme pagal Platformos buveinės vietą.
        </p>
      </section>
    </LegalDocumentShell>
  );
}
