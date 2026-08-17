import Link from "next/link";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export default function DukPage() {
  return (
    <LegalDocumentShell title="DUK — kaip veikia VAUTO" updated="2026-08-14">
      <p className="font-medium text-[var(--vauto-text)]">
        Principas: <strong>AI padeda. Žmogus sprendžia.</strong> VAUTO yra
        universali skelbimų ir sandorių platforma — transportas, nekilnojamasis
        turtas, darbas, paslaugos, elektronika ir prekės. AI asistentas paruošia
        paiešką ar juodraštį visoms kategorijoms. Jūs patvirtinate kiekvieną
        svarbų žingsnį.
      </p>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kuo VAUTO skiriasi nuo paprasto skelbimų portalo?
        </h2>
        <p>
          Skelbimą galima paruošti iš nuotraukos ar sakinio bet kuriai
          kategorijai, o sandorį vesti per Deal Room: pasiūlymas, mokėjimas,
          siuntos sekimas, ginčas ir patvirtintas atsiliepimas. Būsenas
          (apmokėta, išsiųsta, užbaigta) visada nustato serveris, ne naršyklė.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kokias kategorijas galima skelbti?
        </h2>
        <p>
          Transportą, nekilnojamąjį turtą, elektroniką, paslaugas, darbą, namų ir
          sodo prekes, drabužius ir kitas prekes. Pirmas žingsnis — kategorijos
          parinkimas arba laisvas aprašymas. Specifiniai laukai (markė, plotas,
          dydis) atsiranda tik pagal pasirinktą kategoriją — jie nėra privalomi
          visiems skelbimams.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kaip parduoti?
        </h2>
        <p>
          Pasirinkite kategoriją arba papasakokite, ką skelbiate — VAUTO paruošia
          juodraštį — jūs patikrinat ir publikuojate. AI nesiunčia skelbimo be
          jūsų patvirtinimo.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kaip pirkti?
        </h2>
        <p>
          Pasakote, ko ieškote — buto, paslaugos, technikos ar transporto —
          VAUTO atrenka, palyginate ir pasirenkate. AI nereiškia, kad pirkėjas
          ar kaina yra užtikrinti. Galutinį pasirinkimą darote jūs.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Platformos saugumo mechanizmai, jų ribos ir sąlygos
        </h2>
        <p>
          Sistema gali: vesti sandorį Deal Room, laikyti mokėjimą (Stripe) iki
          gavimo patvirtinimo, rodyti vežėjo sekimą (pvz. Omniva prekėms) ir
          priimti ginčą pagal sandorio bei siuntos įrodymus. Kiekvieną būseną
          tvirtina backend — AI neperveda pinigų ir nekeičia būsenos už jus.
        </p>
        <p className="mt-2">
          Pirkėjai ir pardavėjai lieka atsakingi už objekto būklę, apžiūrą,
          teisėtumą ir tarpusavio susitarimą. NT, darbas ar paslaugos gali turėti
          kitą įvykdymo kelią. Tai nėra visų rizikų draudimas, teismo pakaitalas
          ar objekto kokybės pažyma.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Mokėjimas
        </h2>
        <p>
          Mokėjimo suma imama iš sutarties momentinės kopijos serveryje. Klientas
          nesiunčia sumos ir negali pažymėti sandorio kaip apmokėto. Apmokėjimą
          fiksuoja pasirašytas Stripe webhook.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Siunta ir Omniva
        </h2>
        <p>
          Prekėms pardavėjas gali sukurti siuntos lipduką. Sekimo kodas ir
          vežėjo statusas rodomi Deal Room. „Išsiųsta“ atsiranda po fizinio
          kurjerio įvykio, ne nuo mygtuko naršyklėje. Paslaugoms, darbui ir NT
          siunta nebūtina.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Ginčai
        </h2>
        <p>
          Ginčą galima kelti būsenose „Išsiųsta“ arba „Pristatyta“, kai sandoris
          eina per platformos siuntą. Sprendimą priima VAUTO pagal sandorio,
          pokalbio ir siuntos įrodymus. Tai nėra teismo pakaitalas.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Patvirtinti atsiliepimai
        </h2>
        <p>
          Atsiliepimą galima palikti tik po užbaigto (COMPLETED) sandorio, kuriame
          dalyvavote. VAUTO parenka, ką vertinate. Tuščia reputacija nereiškia
          „0 žvaigždučių“.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Ką sistema daro ir už ką liekate atsakingi jūs
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            VAUTO Score ir kainos rėžis — analitinė rekomendacija visoms
            kategorijoms, ne rinkos vertės pažyma ir ne objekto būklės
            įvertinimas.
          </li>
          <li>
            AI nepriima finansinių sprendimų ir nesudaro sandorio už jus.
          </li>
          <li>
            Platforma nepakeičia profesionalios fizinės apžiūros (transportas,
            NT ar technika) — tai pirkėjo ir pardavėjo atsakomybė.
          </li>
          <li>
            VAUTO neužtikrina pardavimo, pirkėjo, pristatymo termino ar objekto
            kokybės.
          </li>
          <li>
            Nenaudojame teiginių „100 % saugu“ ar „garantuotas pardavėjas“.
          </li>
        </ul>
      </section>

      <p>
        Plačiau: <Link href="/sandoriai/">Sandoriai</Link>
        {" · "}
        <Link href="/taisykles/">Taisyklės</Link>
      </p>
    </LegalDocumentShell>
  );
}
