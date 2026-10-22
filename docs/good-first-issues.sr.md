# Good first issues (predlozi)

[English](./good-first-issues.md) | **Srpski**

Spremni da se objave kao GitHub issue-i. Svaki je namerno omeđen da bude
nezavisan od ostalih i dovoljno mali za prvi PR.

---

### 5. Notification hook na završetak taska/orkestracije

**Problem:** `/plan` pokretanja mogu potrajati. Nema načina da se zna da je
gotovo bez gledanja terminala.

**Zadatak:** Config opcija (npr. `notifyCommand` u `TandemConfig`) koja, kad
je postavljena, pokreće shell komandu (ili šalje na webhook URL) kad se
`/plan` orkestracija završi — odobreno, odbijeno, ili dostignut
`max_review_loops`. Drži je generičkom (shell komanda koju korisnik
podešava) umesto da se Slack hardkoduje — Slack webhook je onda samo jedan
primer u dokumentaciji šta tu staviti.

**Fajlovi:** `src/config/schema.ts`, `src/orchestrator/orchestrate.ts`.
