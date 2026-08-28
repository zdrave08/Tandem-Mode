# Good first issues (predlozi)

[English](./good-first-issues.md) | **Srpski**

Spremni da se objave kao GitHub issue-i. Svaki je namerno omeđen da bude
nezavisan od ostalih i dovoljno mali za prvi PR.

---

### 1. `/compact` — ručna kompakcija konteksta

**Problem:** Duge sesije nagomilaju dosta tool izlaza (pune ispise fajlova,
shell izlaz) u `state.messages`. Nema načina da se to smanji bez pokretanja
nove sesije preko `/new` i gubitka konteksta.

**Zadatak:** Dodaj `/compact` komandu koja sumira trenutni razgovor (jedan
poziv modelu, tražeći kompaktan rezime šta je do sad urađeno i odlučeno) i
zamenjuje `state.messages` sa `[system, rezimeKaoUserIliSystemPoruka]`,
čuvajući session fajl u životu (dodaje rezime, ne gubi originalnu istoriju
na disku).

**Fajlovi:** `src/repl/commands.ts`, `src/repl/state.ts`.

---

### 2. `/diff` — prikaz working-tree diff-a bez pozivanja agenta

**Problem:** `git_diff` postoji kao alat koji *agent* može pozvati, ali nema
brz način da *korisnik* samo vidi šta se dosad promenilo bez trošenja poteza
da to od agenta traži.

**Zadatak:** `/diff` REPL komanda koja pokreće istu logiku kao
`src/agent/tools/gitDiff.ts` (uključujući `--intent-to-add` trik za nove
fajlove) direktno, ispisujući diff u terminal — bez API poziva.

**Fajlovi:** `src/repl/commands.ts` (novi case), može ponovo koristiti
`gitDiffTool.execute`.

---

### 3. `/save-profile` i `/profile` — imenovani config profili

**Problem:** Konfiguracija je trenutno samo global/project/session. Neko ko
želi dve persone (npr. "brzo i jeftino" vs. "temeljno") mora ručno da menja
flagove ili `~/.tandem/config.json`.

**Zadatak:** `/save-profile <ime>` čuva trenutnu runtime konfiguraciju
(model, effort, budžet, maxReviewLoops) u `~/.tandem/profiles/<ime>.json`.
`/profile <ime>` učitava je u trenutnu sesiju. `/profile` bez argumenta
lista sačuvane profile.

**Fajlovi:** novi `src/config/profiles.ts`, kačenje u `src/repl/commands.ts`.

---

### 4. Notification hook na završetak taska/orkestracije

**Problem:** `/plan` pokretanja mogu potrajati. Nema načina da se zna da je
gotovo bez gledanja terminala.

**Zadatak:** Config opcija (npr. `notifyCommand` u `TandemConfig`) koja, kad
je postavljena, pokreće shell komandu (ili šalje na webhook URL) kad se
`/plan` orkestracija završi — odobreno, odbijeno, ili dostignut
`max_review_loops`. Drži je generičkom (shell komanda koju korisnik
podešava) umesto da se Slack hardkoduje — Slack webhook je onda samo jedan
primer u dokumentaciji šta tu staviti.

**Fajlovi:** `src/config/schema.ts`, `src/orchestrator/orchestrate.ts`.

---

### 5. Reviewer treba da vidi build/test rezultate, ne samo git diff

**Problem:** Reviewer (`src/orchestrator/reviewer.ts`) trenutno dobija samo
originalni zadatak, plan, i `git diff`. Ne može da zna da li se izmena
stvarno builduje ili da li testovi prolaze — sudi o obliku koda, ne o
ispravnosti.

**Zadatak:** Neka orkestrator pokrene podesivu build/test komandu (npr. iz
`package.json` skripti, ili polja u projektnom `.tandem/config.json`) posle
što workeri završe, i prosledi izlaz revieweru uz diff. Ovo je stvarni M4
obim (benchmark harness treba isti build/test runner) — vredi dizajnirati
jednom i koristiti na oba mesta.

**Fajlovi:** `src/orchestrator/orchestrate.ts`, `src/orchestrator/reviewer.ts`,
`src/config/schema.ts`.

---

### 6. Linux/macOS čuvanje API ključa

**Problem:** `src/config/credentials.ts` radi samo na Windows-u (DPAPI preko
PowerShell-a). Prvo smo probali cross-platform biblioteku (`cross-keychain`)
i odbacili je — njena auto-detekcija backend-a je trošila 15-18 sekundi po
pozivu na Windows-u čak i sa native bindingom prisutnim i izabranim, što je
neprihvatljivo kašnjenje pri startu za CLI. Direktni DPAPI pozivi su ~500ms.

**Zadatak:** Dodaj `getStoredApiKey`/`setStoredApiKey`/`deleteStoredApiKey`
implementacije za macOS (`security` CLI, dolazi sa OS-om) i Linux
(`libsecret`/`secret-tool`, ili ekvivalent gnome-keyring-a), prateći isti
oblik od tri funkcije. Drži je brzom — izmeri je, ceo razlog zašto ovaj fajl
ne koristi generičku biblioteku je što su se "cross-platform" i "brzo na
svakoj platformi" pokazali kao suprotstavljeni. `DEEPSEEK_API_KEY` već
pokriva korisnike van Windows-a u međuvremenu.

**Fajlovi:** `src/config/credentials.ts`.
