# DeepSeek Coding CLI — Development Plan

**Status:** planiranje / pre-M0
**Tip projekta:** open-source community projekat, public GitHub
**Cilj:** vidljivost + doprinos zajednici, ne prihod
**Prati:** PROJECT MASTER CONTEXT spec (poseban dokument)

---

## 0. Verifikovano stanje DeepSeek API-ja (avgust 2026)

- Modeli: `deepseek-v4-pro` (GA, checkpoint Pro-0813) i `deepseek-v4-flash`
  (checkpoint Flash-0731, public beta). Postoji i `deepseek-v4-flash-vision-exp`.
- 1M token kontekst, 384K max output, thinking i non-thinking modovi,
  tool calls, JSON output, OpenAI-kompatibilan i Anthropic-kompatibilan format,
  native Responses API.
- **Peak/off-peak cenovnik** (od 16.08.2026, per 1M tokena):
  - Flash: $0.22 in / $0.66 out off-peak; duplo u peak satima
  - Pro: $0.66 in / $1.98 out off-peak; duplo u peak satima
  - Cache-hit input: $0.007 (Flash) / $0.022 (Pro) — **faktor ~30 jeftinije**
  - Peak sati: 01:00–04:00 i 06:00–10:00 UTC
- Poznata zamka: `reasoning_content` u streamu — ne sme se slepo vraćati
  u message history (lomi naivne klijente). Verifikovati u M0.

> Ovi podaci se re-verifikuju u M0 protiv živog API-ja i zvanične
> dokumentacije. Ništa se ne implementira na osnovu blog postova.

---

## 1. OTVORENA ODLUKA: tech stack

**Rok odluke: pre početka M1.** M0 je stack-agnostičan (throwaway kod).

### Opcija A — TypeScript + Node (preporuka za community cilj)
- Distribucija: `npm install -g` — nula frikcije za ciljnu publiku
- Kontributorski pool: praktično svi CLI agenti ove kategorije su TS;
  potencijalni kontributori već žive u tom ekosistemu
- Referentni materijal: Ink (terminal UI), streaming paterni — sve TS
- Stack: Node 20+, TypeScript, ESM, Ink, pnpm
- Minus: nije Zdravetov matični teren → sporiji start, manja radost

### Opcija B — .NET (dotnet tool)
- Distribucija: `dotnet tool install -g` — filtrira publiku na .NET developere
- Kontributorski pool za CLI agente: znatno manji
- Plus: maksimalna lična brzina i motivacija; Spectre.Console je odličan
- Legitiman izbor ako se cilj redefiniše ka "internom alatu koji je javan"

### Postupak odluke
1. **M0 spike se radi u .NET-u** — zadovoljava refleks, uči API, kod je
   ionako throwaway.
2. Posle M0: probni dan u TS-u (skeleton Ink aplikacije, jedan API poziv
   sa streamom).
3. Odluka po kriterijumu: *ako TS ide "preko volje" → .NET, jer projekat
   iz dosade koji ne raduje umire na M2. Bolje živ .NET projekat nego
   mrtav TS projekat.* Inače → TS.

Odluka se upisuje ovde: **STACK = TypeScript** (datum: 2026-08-27)

> Odluka doneta unapred, bez .NET/TS probnog poređenja — distribucija
> (`npm install -g`) i veličina TS kontributorskog pool-a za ovu
> kategoriju alata su dovoljno jak argument sami po sebi. M0 se zato
> radi direktno u TS-u (throwaway kod i dalje, ali nema potrebe za
> paralelnim .NET spike-om).

---

## 2. Pre-launch odluke (male ali bitne)

- [ ] **Ime moda umesto "Brutal Coder"** — za GitHub launch zvuči kao meme.
      Kandidati: `relay`, `tandem`, `forge`. Planner/worker/reviewer priča
      se bolje prodaje ozbiljnim imenom.
- [ ] Ime paketa/CLI komande (kratko, slobodno na npm registru)
- [ ] Licenca: MIT
- [ ] Disclaimer u README: "Independent open-source project. Not affiliated
      with or endorsed by DeepSeek."

---

## 3. Milestones

### M0 — API spike (2–3 dana, throwaway kod, .NET)
Verifikovati protiv živog API-ja i dokumentovati u `docs/api-notes.md`:
- [x] Tačna sintaksa thinking mode i reasoning effort parametara
- [x] `reasoning_content` u streaming odgovoru — format i pravilno rukovanje
      (šta se sme, a šta ne sme vraćati u history) — **dokumentacija i live
      ponašanje se ovde razilaze, videti api-notes.md sekcija 2**
- [x] Struktura `usage` objekta — da li cache hit/miss tokeni stižu odvojeno
- [x] Tool calling u thinking modu — ponašanje i edge case-ovi
- [x] Responses API — da li donosi nešto za agentic petlju vs chat completions
      (odluka: M1 ostaje na chat completions)
- [x] Cache ponašanje u praksi — šta čini prefiks "stabilnim" (osnovno
      potvrđeno, TTL ostaje otvoreno)
- [x] Peak/off-peak — da li API vraća info ili se računa lokalno po UTC satu
      (potvrđeno: lokalno, API ne pomaže)

**Izlaz:** `docs/api-notes.md` = izvor istine za sve dalje. **M0 zatvoren
2026-08-27**, urađen direktno u TS-u (stack odluka pala unapred, tačka 1).

### M1 — Jezgro agenta, jedan model (2–3 nedelje)
70% vrednosti projekta. Mora biti solidno pre ikakve orkestracije.
- [x] Agentic petlja: V4 Pro + tools, iterativno do rešenja
      (`src/agent/loop.ts` — potvrđeno uživo: tool-call fragmenti se spajaju
      po `index`, `reasoning_content` se čuva i vraća kad su tools u igri
      po dokumentovanom ugovoru iz M0)
- [x] Alati: `read_file`, `search` (ripgrep), `edit` (string replace),
      `shell` (bash/powershell), `list_dir`, `git_diff` — `src/agent/tools/`,
      svih šest testirano uživo (read/edit/shell potvrđeni end-to-end)
- [x] Sesija sa perzistencijom (nastavak rada) — JSONL po sesiji u
      `.tandem/sessions/`, `--resume` flag testiran (nastavlja sa cache-om
      na starom prefiksu)
- [x] Usage tracking isključivo iz API `usage` polja — nikad procena
      (`src/agent/usage.ts` + `pricing.ts`, peak/off-peak svesno)
- [x] Windows first-class od prvog commita: `path.resolve` svuda, `shell`
      alat pokreće PowerShell na win32, `edit` čuva CRLF/LF stil originala
- [x] Safety: nikad silent destruktivne operacije (spec tačka 22) —
      `isDestructive()` po alatu + `approve()` callback u petlji; CLI traži
      y/n u terminalu, `--yes` flag za CI/automatizaciju uvek ispisuje
      upozorenje pre izvršavanja (nikad tiho)

**Izlazni kriterijum: ✅ ZATVOREN (2026-08-27).** Agent je samostalno odradio
4 realna fixa na WP pluginu (bulk-price-wizard), end-to-end, sa
`php -l` validacijom — kao deo M4 benchmark serije (12/12 pokretanja tačno,
videti `docs/benchmark-results.md`). Rađeno protiv posvećene lokalne kopije
repoa, ne protiv radne kopije korisnika.

### M2 — UX sloj (1–2 nedelje)
- [x] Komande: `/model`, `/thinking`, `/effort`, `/status`, `/usage`,
      `/budget`, `/new`, `/resume`, `/clear`, `/help` — interaktivni REPL
      (`tandem` bez argumenta); `tandem "task"` ostaje single-shot za
      skriptovanje/CI, sad i sa `--model`/`--effort`/`--budget` flagovima
- [x] Konfiguracija: session (runtime, slash komande) > project
      (`.tandem/config.json` u cwd) > global (`~/.tandem/config.json`)
- [x] API ključ u OS credential storage, nikad u logu; `DEEPSEEK_API_KEY` env
      i dalje radi kao eksplicitan override za CI. **Izmenjeno 2026-08-27:**
      `cross-keychain` zamenjen sopstvenim DPAPI wrapper-om (`src/config/credentials.ts`)
      posle testa pravog global install-a — cross-keychain-ova auto-detekcija
      backend-a je trošila 15-18s PO POZIVU na Windows-u čak i sa native
      bindingom, direktan DPAPI poziv je ~500ms. Linux/macOS ide u
      good-first-issues (`docs/good-first-issues.md` #7).
- [x] Budget hard-stop: proverava se PRE svakog poziva u petlji, prekida bez
      greške, sesija ostaje sačuvana (JSONL), nastavak radi odmah posle
      `/budget <veći iznos>` u istoj sesiji
- [x] First-run wizard (`@inquirer/prompts` — maskiran unos ključa, izbor
      default modela/effort-a); **NIJE testiran end-to-end** — traži pravi
      TTY, nemoguće u ovom razvojnom okruženju, treba ručna provera

**Napomena:** čitanje komandi u REPL-u je namerno event-driven
(`for await...of rl`), ne `.question()` — potonji se pokazao nepouzdan na
non-TTY/piped stdin (drugi poziv nikad ne razrešava, potvrđeno izolovanim
testom). Usput otkrivena i TS CFA zamka: promenljiva zatvorena u closure-u i
ponovo dodeljena unutar petlje/IIFE-a suzi se na `never` — zaobiđeno `{current}`
ref-objektom umesto gole `let`.

### M3 — Orkestracija: planner / worker / reviewer (2–3 nedelje)
- [x] Planner (Pro, thinking ON, effort MAX) → plan kao **JSON** (`response_format:
      json_object`), validiran runtime type guard-om pre upotrebe —
      worker dobija mašinski parsabilan zadatak (`src/orchestrator/planner.ts`)
- [x] Worker (Flash) sa svežim, minimalnim kontekstom po tasku — svaki task
      dobija NOVI `messages` niz (stabilan prefiks + task), nikad ceo
      planner razgovor (`src/orchestrator/orchestrate.ts`)
- [x] Reviewer (Pro): dobija original task + plan + git diff → APPROVE ili
      strukturirane korekcije, JSON (`src/orchestrator/reviewer.ts`).
      **Build/test rezultate reviewer još ne dobija** — ostaje za M4 kad
      benchmark harness definiše kako se build/test pokreće po projektu.
- [x] `max_review_loops` konfigurabilan (config + `--max-review-loops`),
      default 3, testirano uživo — zaustavlja se bez beskonačne petlje
- [x] **Cache-aware prompt arhitektura:** sistemski prompt + repo mapa + plan
      kao stabilan prefiks (bajt-za-bajt identičan), task na kraju — potvrđeno
      uživo, cache hit rastao 4608→7168 tokena kroz dva worker poziva
- [x] **Peak/off-peak svest:** `/usage` pokazuje off-peak projekciju cene;
      upozorenje pri startu REPL-a u peak satima

**Dodatak van originalnog plana — Vision (`view_image` alat):** korisnik
može reći agentu gde je screenshot/slika buga, agent sam pozove
`deepseek-v4-flash-vision-exp` (izolovano, bez tools/thinking) i dobije
tekstualni opis nazad u svoj kontekst. Testirano uživo kroz punu tool-calling
petlju. Vidi `docs/api-notes.md` #8.

**Pravi bug nađen uživo:** `git diff` ne prikazuje potpuno nove (untracked)
fajlove — reviewer je zato 3x zaredom odbijao ispravno urađen posao ("diff je
prazan"). Ispravljeno u `git_diff` alatu sa `git add --intent-to-add --all`
pre diff-a (markira nove fajlove bez stage-ovanja sadržaja). Utiče i na
agentovu sopstvenu upotrebu `git_diff` alata, ne samo na reviewer.

### M4 — Benchmark + launch (1–2 nedelje)
- [x] Dizajn benchmarka: tri konfiguracije (Pro-only/Flash-only/orkestracija),
      12 dimenzija iz spec tačke 30, format taska — `docs/benchmark-design.md`
- [x] `src/benchmark/types.ts` — konkretni tipovi za rezultate
- [x] `src/benchmark/runner.ts` — headless runner (bez Ink UI), reset/inject/
      run/verify/report ciklus, otporan na pad pojedinačnog pokušaja
- [x] **Benchmark izvršen (2026-08-27)** protiv bulk-price-wizard
      (posvećena lokalna kopija, ne radna kopija korisnika) — 4 ubačena bага
      × 3 konfiguracije = 12 pokretanja. **12/12 tačno, 12/12 build (`php -l`)
      prošao, 0 nepotrebnih izmena.** Detalji: `docs/benchmark-results.md`.
- [x] Merenja: 9 od 12 dimenzija automatizovano i izmereno (completion,
      correctness, build, test[=N/A, nema PHPUnit], unnecessary changes,
      failed attempts, self-correct, tokeni, requesti, cena, vreme).
      Dimenzija 8 (arhitektura) namerno ostaje kvalitativna/ručna, po dizajnu.
- [x] Rezultati u README **kakvi god da su** — nalaz JE mešovit: kvalitet
      identičan (100% kod sve tri konfiguracije), ali orkestracija je ~9.5x
      skuplja i ~19x sporija od Pro-only za ovu klasu (mali, jednodatotečni)
      zadataka — suprotno hipotezi iz sekcije 7 za OVU veličinu zadatka.
      Otvoreno pitanje za sledeći benchmark: veći, multi-file zadaci gde
      orkestracija ima šta da dekomponuje.
- [x] README: quick start, arhitektura, feature lista, benchmark nalaz,
      disclaimer (`README.md`). Terminal GIF (vhs) i dalje odložen.
- [x] CONTRIBUTING.md + 6 unapred napisanih "good first issue" tiketa
      (`docs/good-first-issues.md`) — spremni za GitHub, čekaju da se otvore
      (`gh` CLI nije dostupan u ovom razvojnom okruženju)
- [x] LICENSE (MIT)
- [ ] Objava: r/LocalLLaMA, HN Show, DeepSeek Discord — korisnikova odluka
      kad i šta se objavljuje

---

## 4. Svesno odloženo iz v0.1 (→ good first issues)

Navedeno u spec-u ali nije potrebno za launch — i vrednije kao mamac
za kontributore nego kao sopstveni rad:
- `/save-profile` i `/profile` (profili)
- `/compact` (ručna kompakcija konteksta)
- `/diff` komanda (`/plan` je urađen u M3, ranije nego što je plan predvideo)
- Linux/macOS fino poliranje (ako arhitektura prirodno ne pokrije) —
  clipboard paste slike (`/paste`) trenutno samo Windows, isto obrazloženje
- **Notification hook** (Slack webhook na završetak taska/orkestracije) —
  postoji kod `deepcode-cli` (konkurentski projekat), dobar kandidat za
  kontributorski mamac po istom principu kao gornje stavke

## 4a. Dodato posle poređenja sa deepcode-cli (github.com/lessweb/deepcode-cli)

Zreliji konkurentski projekat (2.2k zvezdica) je otkrio prave rupe koje
originalni spec nije predvideo — implementirano:
- **ESC-interrupt**: `AbortSignal` provučen kroz ceo stack (streaming poziv,
  chatCompletionOnce, shell child proces) — ESC u REPL-u prekida trenutni
  potez, čuva parcijalan sadržaj/reasoning kao poruku, sesija ostaje validna.
  Radi samo na pravom TTY-ju (piped/scriptovani unos nema keypress evente).
- **`/fork`**: nova sesija sa kopijom trenutne istorije, originalna sesija
  netaknuta.
- **"Uvek dozvoli" odobrenje** (`y`/`n`/`a` na destruktivni tool poziv) —
  `a` pamti dozvolu za taj alat do kraja sesije, smanjuje umor od stalnog
  potvrđivanja istog alata.
- **`web_search` alat**: preko DeepSeek Responses API-ja (`/responses`,
  `web_search` tool, stateless poziv) — isti obrazac izolacije kao
  `view_image`. Vidi docs/api-notes.md #10.
- **`/paste`**: slika iz Windows clipboard-a (PowerShell + .NET
  Clipboard/Bitmap) → sačuvana u `.tandem/tmp/`, agent je odmah pogleda
  preko `view_image`. Testirano uživo (crveni kvadrat → tačno prepoznat).
- **Usput otkriven i ispravljen propust**: `view_image` je od M3 pravio
  stvaran naplaćen poziv čiji usage se nikad nije beležio u `/usage`/budžet
  (ni web_search ne bi, da nije otkriveno na vreme) — `ToolContext` sad nosi
  `usage: UsageAccumulator`, oba alata prijavljuju trošak po Flash tarifi
  (najbolja procena, nema objavljen poseban cenovnik za vision-exp/Responses).

Namerno NE kopirano od deepcode-cli: MCP integracija (već van scope-a, tačka 5),
Skills/plugin sistem (prerano za veličinu ovog projekta), VSCode plugin
(van scope-a, IDE ekstenzije).

## 5. Van scope-a (spec tačke 28 i 31 — ne diramo)

MGC integracija, drugi provideri (Anthropic/OpenAI/Qwen/GLM), MCP,
paralelni workeri, GUI, SaaS backend, IDE ekstenzije.

---

## 6. Kalendar (part-time, uz ostale obaveze)

| Faza | Trajanje | Kumulativno |
|---|---|---|
| M0 | 2–3 dana | nedelja 1 |
| M1 | 2–3 nedelje | ~nedelja 4 |
| M2 | 1–2 nedelje | ~nedelja 6 |
| M3 | 2–3 nedelje | ~nedelja 9 |
| M4 | 1–2 nedelje | ~nedelja 10–11 |

**~2–2.5 meseca do launcha.** Posle M1 alat je već upotrebljiv interno.

## 7. Hipoteza koja se testira (ne tvrdi unapred)

> Orkestracija (Pro planner + Flash worker + Pro reviewer) zadržava
> većinu ili sav kvalitet Pro-only pristupa uz značajno manju potrošnju
> Pro tokena.

Ne ide u README kao tvrdnja dok M4 benchmark ne pokaže. (Spec tačka 30.)

## 8. Definicija uspeha

- **Minimum:** alat koji sam koristim umesto Deep Code za DeepSeek rad
- **Dobar ishod:** 100+ zvezdica, bar 3 spoljna kontributora u 3 meseca
  od launcha
- **Odličan ishod:** projekat postane referenca za "DeepSeek coding CLI"
  u zajednici
