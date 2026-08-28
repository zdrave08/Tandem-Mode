# Tandem Mode

[![npm version](https://img.shields.io/npm/v/tandem-mode.svg)](https://www.npmjs.com/package/tandem-mode)
[![license](https://img.shields.io/npm/l/tandem-mode.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/tandem-mode.svg)](./package.json)
[![good first issues](https://img.shields.io/github/issues/zdrave08/Tandem-Mode/good%20first%20issue)](https://github.com/zdrave08/Tandem-Mode/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

[English](./README.md) | **Srpski**

Terminalski coding agent napravljen posebno za DeepSeek API — ne generički
LLM harness u koji je DeepSeek naknadno ugurana. Interaktivni REPL,
planner/worker/reviewer orkestracija, cache-aware arhitektura prompta, i
Windows kao prioritet od prvog dana.

> **Nezavisan open-source projekat. Nije povezan sa DeepSeek-om niti od
> njega podržan.**

## Status

M0–M4 iz [plana razvoja](./deepseek-cli-development-plan.md) su gotovi.
Objavljen na npm-u, upotrebljiv već danas za stvarne coding zadatke nad
lokalnim repozitorijumom.

Prvi benchmark je gotov — pun izveštaj u
[docs/benchmark-results.md](./docs/benchmark-results.md) (na engleskom;
srpska verzija: [docs/benchmark-results.sr.md](./docs/benchmark-results.sr.md)).
Ukratko: sve tri konfiguracije (Pro-only, Flash-only, orkestracija) su
ispravno rešile 4/4 ubačena bага u pravom WooCommerce pluginu, sa čistim
`php -l` i nula nepotrebnih izmena. Ali za ovu klasu zadatka (mali,
jednodatotečni fixevi) orkestracija je koštala ~9.5× više i trajala ~19×
duže od Pro-only, za isti kvalitet — suprotno onome zbog čega bi se
orkestracija tražila. Čitati kao: overhead orkestracije treba veći,
razdvojiv zadatak da bi se isplatio, a ovaj prvi test to nije proverio.
Prijavljeno onako kako jeste, ne prilagođeno očekivanjima.

## Šta ima

- **Agentic petlja** — `deepseek-v4-pro`/`deepseek-v4-flash` sa tool-calling:
  `read_file`, `list_dir`, `search`, `edit`, `git_diff`, `shell`, `view_image`,
  `web_search`.
- **Dva načina rada** — interaktivni REPL za svakodnevni rad, single-shot
  mod (`tandem "task" --yes`) za skriptovanje i CI.
- **Orkestracija** (`/plan`) — planner pravi JSON listu taskova, workeri
  izvršavaju svaki task sa svežim minimalnim kontekstom, reviewer proverava
  git diff naspram originalnog zadatka i ili odobrava ili traži korekcije
  (ograničeno sa `max_review_loops`).
- **Cache-aware promptovi** — sistemski prompt workera + repo mapa + plan
  ostaju bajt-za-bajt identični kroz pozive u jednoj orkestraciji, tako da
  DeepSeek-ov keš stvarno pogađa. Izmereno uživo: cache-hit tokeni su rasli
  iz poziva u poziv unutar jednog `/plan` pokretanja.
- **Vision** — `view_image` omogućava agentu da pogleda screenshot na koji
  ga uputiš; `/paste` uzima sliku iz sistemskog clipboard-a. Na Windows-u
  koristi PowerShell/.NET, na Linux-u `xclip`, a na macOS-u `pngpaste` uz
  `osascript` rezervu.
- **Web search** — izolovani pozivi ka DeepSeek Responses API-ju kad agentu
  treba nešto van repozitorijuma (error poruka, dokumentacija biblioteke).
- **Perzistencija sesije** — svaka sesija je JSONL fajl; `/resume` nastavlja
  poslednju (ili navedenu), `/fork` grana bez diranja originalne.
- **Bezbednost** — destruktivne akcije (izmene fajlova, shell komande van
  male read-only bele liste) uvek traže potvrdu; `y`/`n`/`a` gde `a`
  pamti izbor za taj alat do kraja sesije. `--yes` preskače ovo za CI, ali
  uvek ispisuje šta je automatski odobreno.
- **Kontrola troškova** — usage se čita isključivo iz API-jevog `usage`
  polja, nikad se ne procenjuje. Budžet (`/budget`, `--budget`) zaustavlja
  petlju pre sledećeg poziva ako se pređe, bez gubitka sesije. `/usage`
  takođe pokazuje koliko bi sesija koštala off-peak, a REPL upozorava pri
  startu ako si trenutno u peak periodu.
- **ESC za prekid** — čisto prekida poziv u toku (i bilo koju shell komandu
  koja radi), čuvajući ono što je do tada generisano.
- **Windows prioritet** — shell alat pokreće PowerShell nativno, izmene
  fajlova čuvaju originalni CRLF/LF stil, putanje se svuda tretiraju preko
  `path.resolve`.

## Brzi početak

```bash
npm install -g tandem-mode
tandem            # interaktivni REPL
tandem "objasni sta radi ovaj repo" --yes   # jedan potez
```

Ili iz izvornog koda (korisno za doprinose, ili da pratiš `main` umesto
poslednje npm verzije):

```bash
git clone https://github.com/zdrave08/Tandem-Mode.git
cd Tandem-Mode
pnpm install
pnpm dev            # interaktivni REPL
pnpm dev "objasni sta radi ovaj repo" --yes   # jedan potez
```

Pri prvom pokretanju bićeš pitan za DeepSeek API ključ (napravi ga na
[platform.deepseek.com](https://platform.deepseek.com)) i podrazumevani
model/reasoning effort. Na Windows-u se ključ čuva DPAPI-šifrovan (vezan za
tvoj OS nalog, ista zaštita na kojoj se zasniva i sam Credential Manager) u
`%LOCALAPPDATA%\TandemMode\credentials.dat` — nikad u config fajlu ili logu.
Linux/macOS čuvanje još nije implementirano (`DEEPSEEK_API_KEY` radi svuda
u međuvremenu) — videti good-first-issues.

## Upotreba

```bash
tandem                              # interaktivni REPL
tandem "popravi off-by-one u foo.ts"
tandem --plan "dodaj dark mode na stranicu podešavanja"
tandem "task" --model deepseek-v4-flash --effort low --budget 0.50 --yes
```

| Flag | Efekat |
|---|---|
| `--resume` / `-r` | Nastavi poslednju sesiju u ovom direktorijumu |
| `--yes` / `-y` | Automatski odobri destruktivne akcije (ispisuje šta je odobreno) |
| `--plan` | Pokreni planner/worker/reviewer orkestraciju umesto jednog poteza |
| `--model` | `deepseek-v4-pro` ili `deepseek-v4-flash` |
| `--effort` | `low`, `high`, ili `max` reasoning effort |
| `--budget` | Tvrd USD limit za pokretanje |
| `--max-review-loops` | Limit korekcionih ciklusa u orkestraciji (podrazumevano 3) |

### REPL komande

| Komanda | Efekat |
|---|---|
| `/plan <zadatak>` | Planner/worker/reviewer orkestracija |
| `/model [ime]` | Prikaži ili promeni model |
| `/thinking [on\|off]` | Uključi/isključi thinking mode |
| `/effort [low\|high\|max]` | Prikaži ili postavi reasoning effort |
| `/status` | Trenutna sesija/podešavanja |
| `/usage` | Tokeni, cena, off-peak projekcija |
| `/budget [iznos]` | Prikaži ili postavi budžet sesije |
| `/new` | Nova sesija |
| `/fork` | Nova sesija sa kopijom trenutne istorije |
| `/resume [id]` | Nastavi poslednju (ili navedenu) sesiju |
| `/paste [poruka]` | Pošalji sliku iz sistemskog clipboard-a agentu |
| `/clear` | Očisti ekran |
| `/help` | Ova lista |
| `/exit` | Izlaz |

Pritisni **ESC** u bilo kom trenutku tokom poteza da ga prekineš.

## Arhitektura

```
tandem (bez argumenata) ─┬─> interaktivni REPL ─┬─> jedan potez: agent petlja (alati)
                          │                      └─> /plan: planner → worker(i) → reviewer
tandem "task"     ────────┘   (single-shot, ista agent petlja, za skripte/CI)
```

- `src/deepseek/` — tanak klijent za DeepSeek-ov OpenAI-kompatibilan API
  (streaming + non-streaming chat completions, vision, web search preko
  Responses API-ja). Vidi [`docs/api-notes.md`](./docs/api-notes.md) za
  ponašanje API-ja protiv kog je ovo napravljeno, verifikovano uživo, ne
  pretpostavljeno.
- `src/agent/` — tool-calling petlja, implementacije alata, perzistencija
  sesije, praćenje usage/troška.
- `src/orchestrator/` — planner/worker/reviewer, generisanje repo mape,
  cache-aware konstrukcija stabilnog prefiksa.
- `src/repl/` — slash komande, runtime konfiguracija, first-run wizard.
- `src/cli.tsx` — Ink terminalski UI i REPL/single-shot ulazne tačke.

## Konfiguracija

Slojevito: **sesija** (komande u REPL-u) > **projekat**
(`.tandem/config.json` u trenutnom direktorijumu) > **globalno**
(`~/.tandem/config.json`).

```json
{
  "defaultModel": "deepseek-v4-pro",
  "defaultReasoningEffort": "high",
  "budgetUsd": 5,
  "maxReviewLoops": 3
}
```

API ključ se nikad ne čuva u ovim fajlovima — živi DPAPI-šifrovan na
Windows-u (ili u `DEEPSEEK_API_KEY` env promenljivoj, koja ima prioritet,
za CI upotrebu).

## Razvoj

Vidi [CONTRIBUTING.sr.md](./CONTRIBUTING.sr.md).

```bash
pnpm install
pnpm typecheck
pnpm dev "neki zadatak"
```

## Disclaimer

Ovo je nezavisan projekat koji vodi zajednica. Nije povezan sa DeepSeek-om,
niti od njega podržan ili sponzorisan.

## Licenca

[MIT](./LICENSE)
