# Doprinos Tandem Mode projektu

[English](./CONTRIBUTING.md) | **Srpski**

Hvala što si svratio. Ovo je mali, ranofazni projekat — solo poduhvat koji je
prerastao u open-source, ne firmin proizvod — pa je proces ovde namerno lagan.

## Setup

```bash
git clone https://github.com/zdrave08/Tandem-Mode.git
cd Tandem-Mode
pnpm install
cp .env.example .env   # ili pusti `pnpm dev` da te provede kroz first-run wizard
pnpm typecheck
pnpm dev "procitaj package.json i reci mi verziju" --yes
```

Trebaće ti DeepSeek API ključ ([platform.deepseek.com](https://platform.deepseek.com))
da pokreneš bilo šta što stvarno zove model.

## Osnovna pravila

- **TypeScript, strict.** `pnpm typecheck` mora proći pre PR-a — nema `any`
  bekstva bez konkretnog razloga, `exactOptionalPropertyTypes` je uključen.
- **Nema neproverenog API ponašanja.** Sve što se tiče DeepSeek API-ja a nije
  očigledno iz tipova treba proveriti uživo ili u zvaničnoj dokumentaciji i
  zapisati u [`docs/api-notes.md`](./docs/api-notes.md) (srpski, kanonska
  verzija) / [`docs/api-notes.en.md`](./docs/api-notes.en.md) (engleski), ne
  pretpostaviti iz blog posta ili tuđeg koda. Vidi taj fajl za format —
  Status / Nalaz / Izvor / Datum.
- **Windows je prioritet**, ne naknadna misao. Ako diraš path handling,
  shell alat, ili file I/O, testiraj na Windows-u ili jasno napiši u PR-u da
  nisi i da treba provera.
- **Bezbednost.** Ništa što menja fajlove, pokreće shell komande, ili na bilo
  koji način menja stanje ne sme se desiti tiho. Ako dodaješ alat, daj mu
  ispravan `isDestructive()` — kad nisi siguran, tretiraj kao destruktivno.
- **Male izmene.** Jedna stvar odjednom je lakša za pregled nego redizajn.

## Gde šta živi

- `src/deepseek/` — API klijent (chat completions, vision, web search)
- `src/agent/` — tool-calling petlja, alati, sesije, praćenje troška
- `src/orchestrator/` — planner/worker/reviewer
- `src/repl/` — slash komande, runtime stanje, first-run wizard
- `src/cli.tsx` — Ink UI, REPL i single-shot ulazne tačke

## Dodavanje alata

Prvo pogledaj postojeći (`src/agent/tools/readFile.ts` je jednostavan
read-only primer, `src/agent/tools/edit.ts` destruktivan). Alat je običan
objekat: `name`, `description`, JSON-schema `parameters`, `isDestructive(args)`,
i `execute(args, ctx)`. Registruj ga u `src/agent/tools/index.ts`.

## Good first issues

Traži `good first issue` labelu, ili pogledaj
[`docs/good-first-issues.sr.md`](./docs/good-first-issues.sr.md) za šest spremnih
predloga — `/compact`, `/diff`, `/save-profile`/`/profile`, notification hook
na završetak taska, reviewer da vidi rezultate build/test-a (ne samo git diff),
i Linux/macOS čuvanje API ključa su svi otvoreni. Sekcija 4
[plana razvoja](./deepseek-cli-development-plan.md) ima dodatni kontekst za
preostale predloge.

Pregledanje i preuzimanje issue-a je najlakše preko
[GitHub CLI-ja](https://cli.github.com/) (`gh`):

```bash
# Windows (winget)
winget install --id GitHub.cli
# macOS
brew install gh
# Linux
# vidi https://github.com/cli/cli/blob/trunk/docs/install_linux.md

gh auth login
gh issue list --repo zdrave08/Tandem-Mode --label "good first issue"
```

## Prijava bagova / API iznenađenja

Ako se DeepSeek-ovo stvarno ponašanje ne poklapa sa onim što
`docs/api-notes.md` kaže, to je koristan bug report čak i kad u kodu ništa
nije pogrešno — otvori issue sa request/response-om koji si video.

## Licenca

Doprinosom se slažeš da je tvoj doprinos licenciran pod projektnom
[MIT licencom](./LICENSE).
