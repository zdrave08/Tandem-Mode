# Dizajn benchmarka (M4)

[English](./benchmark-design.md) | **Srpski**

**Status:** napravljen i pokrenut jednom — vidi [`benchmark-results.sr.md`](./benchmark-results.sr.md)
za stvarne brojeve. Ovaj dokument ostaje kao obrazloženje dizajna; ono što je
ispod pod "šta je još otvoreno" je šta bi *drugi, veći* run trebalo da doda.

## Cilj

Testirati hipotezu iz plana (sekcija 7): da li orkestracija (Pro planner +
Flash workeri + Pro reviewer) zadržava većinu kvaliteta Pro-only pristupa uz
značajno manju potrošnju Pro tokena? Ovo se **ne tvrdi nigde** dok benchmark
to stvarno ne pokaže — vidi sekciju 7 plana.

## Tri konfiguracije

Isti set taskova pokrenut na tri načina:

1. **Pro-only** — `deepseek-v4-pro`, bez orkestracije, jedna agent petlja.
2. **Flash-only** — `deepseek-v4-flash`, bez orkestracije, jedna agent petlja.
3. **Orkestracija** — `/plan`, kako je napravljeno u M3.

## 12 dimenzija merenja (spec tačka 30)

| # | Dimenzija | Kako se meri |
|---|---|---|
| 1 | Completion | Da li je agent dao finalan odgovor, ili je pogodio `max_iterations_reached` / `budget_exceeded` / nepovratnu grešku? |
| 2 | Correctness | Da li `verify` (taskom definisana provera) izlazi sa 0 protiv rezultujućeg diff-a? |
| 3 | Build | Da li taskova `build` komanda (ako postoji) uspeva? |
| 4 | Test | Da li taskova `test` komanda (ako postoji) prolazi? |
| 5 | Nepotrebne izmene | Fajlovi dotaknuti van onoga što taskovi kriterijumi prihvatanja podrazumevaju — upoređeno sa ručno pregledanom listom "očekivanih fajlova" po tasku |
| 6 | Failed attempts | Broj `tool_call_result` eventova sa `isError: true` |
| 7 | Self-correction | Neuspeli pokušaj praćen uspešnim ponovnim pokušajem povezane akcije, pre odustajanja |
| 8 | Arhitektura | Kvalitativno — ne automatizuje se. Ocenjuje se ručnim pregledom (ili posebnim LLM-judge prolazom) kvaliteta dizajna diff-a, ne samim harnessom |
| 9 | Tokeni | Iz `UsageAccumulator.totals()` — stvarna API `usage` polja, nikad procena |
| 10 | Requesti | `UsageAccumulator.callCount` |
| 11 | Cena | `UsageAccumulator.estimatedCostUsd()`, plus off-peak ekvivalent za kontekst |
| 12 | Vreme | Wall-clock trajanje pokretanja |

Dimenzije 1–4, 6, 9–12 su direktno automatizovane iz onoga što agent petlja i
usage accumulator već izlažu. Dimenzija 5 treba po-tasku anotaciju
"očekivanih fajlova" za poređenje. Dimenzija 7 treba malu heuristiku (isto
ime alata + isti ili preklapajući argumenti, greška pa uspeh, unutar N
iteracija jedno od drugog). Dimenzija 8 je namerno ostavljena
ručna/kvalitativna — automatizovana ocena tu bi bila samo šum obučen kao
podatak.

## Format taska (planiran oblik za `src/benchmark/types.ts`)

```ts
interface BenchmarkTask {
  id: string;
  description: string;      // prompt dat agentu
  expectedFiles: string[];  // za dimenziju 5
  setup?: string;           // shell komanda da vrati target repo na baseline
  build?: string;           // npr. "php -l %file%" ili "npm run build"
  test?: string;            // npr. "npm test"
  verify: string;           // izlazi sa 0 ako je cilj taska stvarno ispunjen
}
```

## Šta je još otvoreno za drugi run

Run 1 je koristio četiri mala, jednodatotečna bага protiv
`bulk-price-wizard` (pravi, privatni WooCommerce plugin — vidi
`docs/benchmark-results.sr.md`). Da bi se stvarno testirala hipoteza o
orkestraciji umesto samo vežbao harness, naredni run treba da doda:

- **Veće, stvarno multi-file taskove** — nešto što bi verovatno imalo koristi
  od dekompozicije (npr. "dodaj novu opciju filtera end-to-end: DTO, query,
  UI, validacija"), pošto jednolinijski bagovi iz run-a 1 orkestraciji nisu
  dali ništa da paralelizuje i samo su izmerili njen koordinacioni overhead.
- **Više taskova po klasi** (run 1 je imao jedan task po tipu bага) da brojevi
  cene/vremena budu manje anegdotalni.
- **Pravu build/test dimenziju** — ovaj target nema PHPUnit setup, pa je
  "test" bio `null` za svaki run u prvom krugu. Target (ili fixture) sa
  stvarnim testovima bi učinio dimenzije 3–4 smislenim umesto samo `php -l`.
- Poređenje setova taskova kroz *različite* target repoe, da se vidi koliko
  je nalaz iz run-a 1 specifičan za veličinu taska naspram ove konkretne
  kodne baze.

## Izveštavanje

Šta god brojevi kažu ide u README onako kako jeste — sekcija 4 master plana
je eksplicitna da je negativan ili mešovit nalaz i dalje kredibilan podatak,
ne prepreka za lansiranje.
