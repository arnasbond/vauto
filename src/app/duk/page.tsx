import Link from "next/link";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";

export default function DukPage() {
  return (
    <LegalDocumentShell title="DUK — kaip veikia VAUTO" updated="2026-08-14">
      <p className="font-medium text-[var(--vauto-text)]">
        Principas: <strong>AI padeda. Žmogus sprendžia.</strong> VAUTO paruošia
        skelbimą, atrenka rezultatus ir veda sandorio eigą. Jūs patvirtinate
        kiekvieną svarbų žingsnį.
      </p>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kuo VAUTO skiriasi nuo paprasto skelbimų portalo?
        </h2>
        <p>
          Čia skelbimą galima paruošti iš nuotraukos ar sakinio, o sandorį vesti
          per Deal Room: pasiūlymas, mokėjimas, Omniva sekimas, ginčas ir
          patvirtintas atsiliepimas. Būsenas (apmokėta, išsiųsta, užbaigta)
          visada nustato serveris, ne naršyklė.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kaip parduoti?
        </h2>
        <p>
          Parodote nuotrauką arba papasakojate — VAUTO paruošia juodraštį — jūs
          patikrinat ir publikuojate. AI nesiunčia skelbimo be jūsų patvirtinimo.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kaip pirkti?
        </h2>
        <p>
          Pasakote, ko ieškote — VAUTO atrenka — palyginate ir pasirenkate. AI
          nereiškia, kad pirkėjas ar kaina yra garantuoti.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Kaip vyksta sandoris?
        </h2>
        <p>
          Susitariate dėl kainos, tada VAUTO padeda aiškiai pereiti eigą:
          priimtas pasiūlymas → mokėjimas (Stripe) → Omniva lipdukas ir sekimas →
          pirkėjo gavimo patvirtinimas → užbaigtas sandoris. Kiekvieną būseną
          tvirtina backend.
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
          Omniva
        </h2>
        <p>
          Pardavėjas sukuria siuntos lipduką. Sekimo kodas ir vežėjo statusas
          rodomi Deal Room. „Išsiųsta“ atsiranda po fizinio kurjerio įvykio, ne
          nuo mygtuko naršyklėje.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--vauto-text)]">
          Ginčai
        </h2>
        <p>
          Ginčą galima kelti būsenose „Išsiųsta“ arba „Pristatyta“. Sprendimą
          priima VAUTO pagal sandorio, pokalbio ir siuntos įrodymus. Tai nėra
          teismo pakaitalas.
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
          Ką VAUTO daro ir ko negarantuoja
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            VAUTO Score ir kainos rėžis — analitinė rekomendacija, ne garantuota
            rinkos vertė ir ne automobilio būklės garantija.
          </li>
          <li>
            AI nepriima finansinių sprendimų ir nesudaro sandorio už jus.
          </li>
          <li>
            Platforma nepakeičia profesionalios fizinės automobilio patikros.
          </li>
          <li>
            VAUTO negarantuoja pardavimo, pirkėjo ar pristatymo termino.
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
