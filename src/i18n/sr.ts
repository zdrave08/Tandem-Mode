import type { MessageKey } from "./en.js";

export const sr: Record<MessageKey, string> = {
  helpText: `Komande:
  /plan <zadatak>                             planner/worker/reviewer orkestracija
  /model [deepseek-v4-pro|deepseek-v4-flash]  prikaži ili promeni model
  /thinking [on|off]                          uključi/isključi thinking mode
  /effort [low|high|max]                      prikaži ili promeni reasoning effort
  /status                                     trenutna podešavanja i sesija
  /diff [--staged] [putanja]                  prikaži diff radnog stabla (bez API poziva)
  /usage                                      utrošak tokena, procenjena cena, off-peak projekcija
  /budget [iznos]                             prikaži ili postavi budžet u USD
  /new                                        nova sesija
  /save-profile <ime>                         sačuvaj model, effort, budžet i review krugove kao profil
  /profile [ime]                              učitaj sačuvan profil, ili prikaži listu
  /compact                                    sažmi istoriju u novu sesiju da se oslobodi kontekst
  /fork                                       nova sesija sa kopijom trenutne istorije
  /resume [id]                                nastavi poslednju ili navedenu sesiju
  /paste [poruka]                             pošalji sliku iz clipboard-a
  /clear                                      očisti ekran
  /help                                       ova lista
  /exit                                       izlaz`,

  usageLine: "Upotreba: {syntax}",
  unknownCommand: "Nepoznata komanda: /{cmd}. Ukucaj /help.",

  modelCurrent: "Trenutni model: {model}",
  effortCurrent: "Trenutni effort: {effort}",

  statusSession: "Sesija: {id}",
  statusBudget: "Budžet: {value}",
  statusNotSet: "nije postavljen",
  statusVerify: "Verify komanda: {value}",
  statusVerifyNone: "nije postavljena",
  statusNotify: "Notify komanda: {value}",
  statusMessages: "Poruka u istoriji: {count}",

  usageCalls: "Pozivi: {count}",
  usageTokens: "Tokeni: {input} in ({cached} cached) / {output} out",
  usageCost: "Procenjena cena: {cost}",
  usageOffPeak: "Ova sesija bi off-peak koštala: {cost}",
  usageBudget: "Budžet: {budget} (iskorišćeno {percent}%)",

  budgetSet: "Budžet postavljen na {amount}.",
  budgetCurrent: "Trenutni budžet: {amount}",
  budgetNone: "Budžet nije postavljen.",

  sessionNew: "Nova sesija: {id}",
  sessionForked: "Sesija forkovana: {id} ({count} poruka preneto, originalna sesija netaknuta)",
  sessionNotFound: "Sesija '{id}' nije pronađena.",
  sessionNoneInDir: "Nema prethodne sesije u ovom direktorijumu.",
  sessionResumed: "Nastavljena sesija: {id} ({count} poruka)",

  compactNothing: "Još nema šta da se sažme.",
  compactWorking: "Sažimam {count} poruka...",
  compactDone:
    "Sažeto {before} poruka u {after}. Nova sesija: {id} (prethodna sesija {previous} ostaje netaknuta na disku)",
  compactFailed: "Sažimanje nije uspelo, istorija je nepromenjena: {message}",

  profileInvalidName: "Imena profila koriste a-z, 0-9, - i _ (do 40 karaktera, počinju slovom ili cifrom).",
  profileSaved: "Profil '{name}' sačuvan u {path}",
  profileLoaded: "Učitan profil '{name}': {summary}",
  profileNotFound: "Profil '{name}' nije pronađen. Ukucaj /profile za listu sačuvanih profila.",
  profileInvalid: "Profil '{name}' nije ispravan: {reason}",
  profileList: "Sačuvani profili: {names}",
  profileNone: "Nema sačuvanih profila. Sačuvaj trenutna podešavanja sa /save-profile <ime>.",

  toolDenied: " (odbijeno)",
  toolMoreLines: " … ({count} linija)",
  destructiveAction: "Destruktivna akcija: {call}",
  approvalHint: "y = dozvoli, n = odbij, a = uvek dozvoli ovaj alat ovoj sesiji (odgovor ispod)",
  approvalPrompt: "Dozvoli izvršavanje {call}? (y/n/a — a = uvek dozvoli ovaj alat)",
  autoApproved: "[--yes] auto-odobreno: {call}",
  errorPrefix: "Greška: {message}",
  maxIterations:
    "Dostignut je maksimalan broj iteracija bez finalnog odgovora. Sesija je sačuvana: pošalji poruku (npr. \"nastavi\") da nastavi tamo gde je stao.",
  continueAsk: "Agent je iskoristio {n} poziva i nije završio.",
  continueHint: "y = nastavi još {chunk} poziva, n = stani, a = uvek nastavi u ovoj sesiji (odgovor ispod)",
  continuePrompt: "Nastaviti još {chunk} poziva? (y/n/a — a = uvek nastavi u ovoj sesiji)",
  autoContinued: "[auto-continue] iskorišćeno {n} poziva, nastavljam (potrošeno ~{spent} od {budget})",
  autoContinueNeedsBudget:
    "autoContinue radi samo uz budžet (--budget ili budgetUsd); bez njega agent pita pre nastavka.",
  continueStopped:
    "Stao na granici iteracija (neinteraktivni rad). Pokreni ponovo sa --auto-continue i --budget da nastavi.",
  statusMode_chat: "chat",
  statusMode_plan: "plan",
  statusCalls: "poziv {n}/{max}",
  budgetExceeded:
    "Budžet od {budget} je dostignut (potrošeno ~{spent}). Petlja je zaustavljena pre sledećeg poziva — sesija je sačuvana, povećaj budžet sa /budget i nastavi.",
  interrupted: "⏹ Prekinuto (ESC). Sesija je sačuvana do ove tačke.",
  orchestrationInterrupted: "⏹ Orkestracija prekinuta (ESC).",
  orchestrationError: "Greška u orkestraciji: {message}",

  replHint: "/help za komande, /exit za izlaz.\n",
  peakWarning: "⚠ Trenutno je peak sat (01–04h ili 06–10h UTC) — cene su duplo veće nego off-peak.\n",
  waitForTurn: "Sačekaj da se trenutni potez završi.",
  pasteNoImage: "Nema slike u clipboard-u.",

  noApiKey:
    "Nema DeepSeek API ključa. Postavi DEEPSEEK_API_KEY env promenljivu ili pokreni tandem interaktivno da odradiš first-run wizard.",
  keyNotSaved: "Ključ nije sačuvan ispravno — pokušaj ponovo.",
  noSessionToResume: "Nema prethodne sesije za nastavak u ovom direktorijumu.",

  wizardIntro: "Prvo pokretanje — potreban je DeepSeek API ključ.\n",
  wizardLanguage: "Jezik:",
  wizardApiKey: "DeepSeek API ključ:",
  wizardKeyEmpty: "Ključ ne može biti prazan.",
  wizardModel: "Podrazumevani model:",
  wizardModelPro: "deepseek-v4-pro (jači, skuplji)",
  wizardModelFlash: "deepseek-v4-flash (brži, jeftiniji)",
  wizardEffort: "Podrazumevani reasoning effort:",
  wizardSaved: "\nSačuvano — ključ je u OS credential store-u, podešavanja u ~/.tandem/config.json.\n",

  orchPlanning: "\n📋 Planiram...\n",
  orchPlan: "Plan: {summary}",
  orchWorker: "\n🔧 Worker: {description}\n",
  orchWorkerCorrection: "\n🔧 Worker (korekcija): {description}\n",
  orchReviewer: "\n🔍 Reviewer proverava...\n",
  orchVerify: "\n🧪 Verify: {command}\n",
  orchVerifyPassed: "  prošlo",
  orchVerifyFailed: "  palo (exit {code})",
  orchApproved: "✅ Reviewer odobrio. {notes}\n",
  orchChangesRequested: "⚠ Reviewer traži izmene ({loops}/{max}): {notes}",
  orchMaxLoops: "\n❌ Dostignut max_review_loops ({max}) bez odobrenja — proveri ručno.\n",
  notifyFailed: "⚠ Komanda za obaveštenje nije uspela: {reason}",

  clipboardCmdNotFound: 'Komanda "{cmd}" nije pronađena. {hint}',
  clipboardInstallWl: "Instaliraj wl-clipboard (npr. sudo apt install wl-clipboard).",
  clipboardInstallXclip: "Instaliraj xclip (npr. sudo apt install xclip).",
  clipboardUnsupported: 'Clipboard paste slike nije podržan na platformi "{platform}".',
};
