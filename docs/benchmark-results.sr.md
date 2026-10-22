# Rezultati benchmarka — run 1

[English](./benchmark-results.md) | **Srpski**

**Datum:** 2026-08-27
**Target:** `bulk-price-wizard` — pravi WooCommerce plugin (~1.6 MB,
bez build tooling-a, bez test suite-a), još nije javan. Benchmarkovan protiv
posvećene lokalne kopije, nikad protiv radnog repozitorijuma održavaoca.

**Metod:** četiri poznata bага namerno ubačena u čist baseline commit
(SWE-bench stil — pravi kod, precizan/reproduktivan bag, objektivna verify
skripta), svaki pokrenut protiv sve tri konfiguracije. Verifikacija je
samostalna PHP skripta po tasku (vidi
`src/benchmark/fixtures/bulk-price-wizard/`) koja direktno zahteva
pluginove sopstvene klase, uz minimalne WP/WC stubove — nema curenja bага:
agent nikad ne vidi verify skriptu, samo opis taska.

## Glavni nalaz

**Svih 12 pokretanja (4 taska × 3 konfiguracije) je ispravno popravilo bag,
sa čistim `php -l` i nula nepotrebnih izmena fajlova.** Po tačnosti, nema
razlike između Pro-only, Flash-only, i orkestracije za ovu klasu zadataka.

Razlika je u ceni i vremenu — i ide u suprotnom pravcu od hipoteze iz plana
(sekcija 7):

| Konfiguracija | Ukupna cena | Ukupno vreme | Ukupno requesta | Failed attempts |
|---|---|---|---|---|
| **Pro-only** | **$0.0122** | **44s** | 16 | **0** |
| Flash-only | $0.0090 | 77s | 29 | 8 |
| Orkestracija | $0.1157 | 844s (14 min) | 92 | 28 |

Orkestracija je koštala **~9.5×** više od Pro-only i trajala **~19×** duže po
wall-clock vremenu, za identičnu tačnost, na svakom pojedinačnom tasku u
ovom setu.

## Detalji po tasku

| Task | Config | Tačno | Build | Requesti | Failed attempts | Cena | Vreme |
|---|---|---|---|---|---|---|---|
| money-rounding | pro-only | ✅ | ✅ | 4 | 0 | $0.0024 | 12.2s |
| money-rounding | flash-only | ✅ | ✅ | 7 | 3 | $0.0013 | 23.1s |
| money-rounding | orchestration | ✅ | ✅ | 22 | 6 | $0.0143 | 115.7s |
| percent-decrease | pro-only | ✅ | ✅ | 4 | 0 | $0.0034 | 9.9s |
| percent-decrease | flash-only | ✅ | ✅ | 4 | 0 | $0.0012 | 6.4s |
| percent-decrease | orchestration | ✅ | ✅ | 25 | 9 | $0.0465 | 325.7s |
| min-price-guard | pro-only | ✅ | ✅ | 4 | 0 | $0.0038 | 13.1s |
| min-price-guard | flash-only | ✅ | ✅ | 12 | 4 | $0.0053 | 38.2s |
| min-price-guard | orchestration | ✅ | ✅ | 28 | 8 | $0.0445 | 323.7s |
| validator-percent-cap | pro-only | ✅ | ✅ | 4 | 0 | $0.0026 | 9.2s |
| validator-percent-cap | flash-only | ✅ | ✅ | 6 | 1 | $0.0012 | 9.6s |
| validator-percent-cap | orchestration | ✅ | ✅ | 17 | 5 | $0.0104 | 78.4s |

Sirovi JSON: [`benchmark-results-2026-08-27.json`](./benchmark-results-2026-08-27.json).

## Šta ovo znači za hipotezu iz plana

Plan, sekcija 7: *"Orkestracija zadržava većinu ili sav kvalitet Pro-only
pristupa uz značajno manju potrošnju Pro tokena."*

**Pola potvrđeno, pola opovrgnuto, za ovu veličinu zadatka.** Kvalitet
(mereno kao tačnost — da li je bag stvarno popravljen) je potpuno zadržan:
4/4 za svaku konfiguraciju. Ali cena nije smanjena — suprotno, smanjena je
skoro za red veličine, i sa mnogo većom razlikom u wall-clock vremenu.
Pro-only je takođe bio jeftiniji od Flash-only na dva od četiri taska, jer su
Pro-ovi ređi neuspeli pokušaji (0 kroz sve) više nego nadoknadili njegovu
veću cenu po tokenu.

**Tumačenje, još nedokazano:** ovo su jednodatotečni, jednolinijski bagovi sa
očiglednim fixom kad se lociraju — tačno slučaj gde planner/worker/reviewer
podela dodaje čist koordinacioni overhead (koraci planiranja, worker koji
ponovo istražuje ono što je planner već opisao, review prolaz, povrh onoga
što svaka faza ima svojih neuspelih pokušaja) bez ičega za paralelizaciju ili
dekompoziciju. Premisa plana za isplativost orkestracije — veliki, multi-file
taskovi sa nezavisnim pod-delovima koje jedan kontekst ne drži dobro — nikad
nije testirana ovim setom taskova. **Otvorena stavka za budući benchmark:**
dodati veće, stvarno multi-file/multi-step taskove i videti da li se slika
cene/vremena preokreće, po sopstvenoj metodologiji plana — testirati, ne
tvrditi hipotezu unapred.

## Šta nije uključeno

- **Dimenzija 5 (nepotrebne izmene) je bila 0 za svih 12 pokretanja** — čist
  signal, ali ovaj set taskova to ne testira pod stresom; task gde ispravan
  fix stvarno obuhvata više fajlova bio bi bolji test da li agent
  preterano menja.
- **Dimenzija 8 (arhitektura)** je namerno neocenjena ovde — vidi
  `docs/benchmark-design.sr.md`, kvalitativna je po dizajnu.
- **Build/test dimenzije** su samo `php -l` — ovaj plugin nema PHPUnit setup,
  pa je "test" `null` za svako pokretanje, ne neuspeh.
- Harness bag je isplivao i popravljen usred serije: benchmarkov sopstveni
  `.tandem/` session log nije bio gitignore-ovan u target kopiji, pa je
  reviewer prvog pokušaja to označio kao "nepotreban fajl" i naredio workeru
  da ga obriše — što je srušilo pokretanje jer je harness i dalje pisao u taj
  fajl. Popravljeno gitignore-ovanjem `.tandem/` u benchmark kopiji *i*
  time da `appendSessionMessage` rekreira svoj fajl ako nestane usred
  sesije, pošto je agent koji briše fajl za koji misli da je "nepotreban"
  stvaran scenario, ne samo benchmark artefakt.
- Drugo pokretanje se srušilo kad je planner vratio prazan odgovor —
  povremeni API odgovor, ne kršenje šeme. `runPlanner`/`runReviewer` sad
  imaju jedan retry, a `runBenchmark` beleži neuspeo pokušaj (umesto da
  sruši celu seriju) ako task/config kombinacija i dalje pukne.
