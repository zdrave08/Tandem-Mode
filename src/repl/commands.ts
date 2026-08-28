import {
  createSession,
  findLatestSession,
  findSessionById,
  loadSessionMessages,
  appendSessionMessage,
} from "../agent/session.js";
import type { RuntimeState } from "./state.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

export type CommandOutcome = "continue" | "exit";

const HELP_TEXT = `Komande:
  /plan <zadatak>                             planner/worker/reviewer orkestracija
  /model [deepseek-v4-pro|deepseek-v4-flash]  prikaži ili promeni model
  /thinking [on|off]                          uključi/isključi thinking mode
  /effort [low|high|max]                      prikaži ili promeni reasoning effort
  /status                                     trenutna podešavanja i sesija
  /usage                                      utrošak tokena, procenjena cena, off-peak projekcija
  /budget [iznos]                             prikaži ili postavi budžet u USD
  /new                                        nova sesija
  /fork                                       nova sesija sa kopijom trenutne istorije
  /resume [id]                                nastavi poslednju ili navedenu sesiju
  /paste [poruka]                             pošalji sliku iz sistemskog clipboard-a
  /clear                                      očisti ekran
  /help                                       ova lista
  /exit                                       izlaz`;

export async function handleCommand(line: string, state: RuntimeState): Promise<CommandOutcome> {
  const [cmd = "", ...rest] = line.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
      console.log(HELP_TEXT);
      return "continue";

    case "exit":
    case "quit":
      return "exit";

    case "model":
      if (arg === "deepseek-v4-pro" || arg === "deepseek-v4-flash") {
        state.model = arg;
        console.log(`Model: ${arg}`);
      } else if (!arg) {
        console.log(`Trenutni model: ${state.model}`);
      } else {
        console.log("Upotreba: /model deepseek-v4-pro|deepseek-v4-flash");
      }
      return "continue";

    case "thinking":
      if (arg === "on" || arg === "off") {
        state.thinkingEnabled = arg === "on";
        console.log(`Thinking: ${arg}`);
      } else if (!arg) {
        console.log(`Thinking: ${state.thinkingEnabled ? "on" : "off"}`);
      } else {
        console.log("Upotreba: /thinking on|off");
      }
      return "continue";

    case "effort":
      if (arg === "low" || arg === "high" || arg === "max") {
        state.reasoningEffort = arg;
        console.log(`Reasoning effort: ${arg}`);
      } else if (!arg) {
        console.log(`Trenutni effort: ${state.reasoningEffort}`);
      } else {
        console.log("Upotreba: /effort low|high|max");
      }
      return "continue";

    case "status": {
      console.log(`Sesija: ${state.session.id}`);
      console.log(`Model: ${state.model}`);
      console.log(`Thinking: ${state.thinkingEnabled ? `on (${state.reasoningEffort})` : "off"}`);
      console.log(`Budžet: ${state.budgetUsd !== undefined ? `$${state.budgetUsd.toFixed(2)}` : "nije postavljen"}`);
      console.log(`Max review loops: ${state.maxReviewLoops}`);
      console.log(`Poruka u istoriji: ${state.messages.length}`);
      return "continue";
    }

    case "usage": {
      const totals = state.usage.totals();
      const cost = state.usage.estimatedCostUsd();
      const offPeakCost = state.usage.offPeakEquivalentCostUsd();
      console.log(`Pozivi: ${state.usage.callCount}`);
      console.log(
        `Tokeni: ${totals.promptTokens} in (${totals.promptCacheHitTokens} cached) / ${totals.completionTokens} out`
      );
      console.log(`Procenjena cena: $${cost.toFixed(4)}`);
      if (Math.abs(cost - offPeakCost) > 0.0000001) {
        console.log(`Ova sesija bi off-peak koštala: $${offPeakCost.toFixed(4)}`);
      }
      if (state.budgetUsd !== undefined) {
        console.log(`Budžet: $${state.budgetUsd.toFixed(2)} (iskorišćeno ${((cost / state.budgetUsd) * 100).toFixed(0)}%)`);
      }
      return "continue";
    }

    case "budget":
      if (arg) {
        const n = Number(arg);
        if (Number.isFinite(n) && n > 0) {
          state.budgetUsd = n;
          console.log(`Budžet postavljen na $${n.toFixed(2)}.`);
        } else {
          console.log("Upotreba: /budget <iznos u USD>");
        }
      } else {
        console.log(
          state.budgetUsd !== undefined ? `Trenutni budžet: $${state.budgetUsd.toFixed(2)}` : "Budžet nije postavljen."
        );
      }
      return "continue";

    case "new": {
      state.session = await createSession(state.cwd);
      const systemMsg = { role: "system" as const, content: SYSTEM_PROMPT };
      state.messages = [systemMsg];
      await appendSessionMessage(state.session, systemMsg);
      console.log(`Nova sesija: ${state.session.id}`);
      return "continue";
    }

    case "fork": {
      const forked = await createSession(state.cwd);
      for (const msg of state.messages) {
        await appendSessionMessage(forked, msg);
      }
      state.session = forked;
      console.log(`Sesija forkovana: ${forked.id} (${state.messages.length} poruka preneto, originalna sesija netaknuta)`);
      return "continue";
    }

    case "resume": {
      const target = arg ? await findSessionById(state.cwd, arg) : await findLatestSession(state.cwd);
      if (!target) {
        console.log(arg ? `Sesija '${arg}' nije pronađena.` : "Nema prethodne sesije u ovom direktorijumu.");
        return "continue";
      }
      state.messages = await loadSessionMessages(target.filePath);
      state.session = target;
      console.log(`Nastavljena sesija: ${target.id} (${state.messages.length} poruka)`);
      return "continue";
    }

    case "clear":
      console.clear();
      return "continue";

    default:
      console.log(`Nepoznata komanda: /${cmd}. Ukucaj /help.`);
      return "continue";
  }
}
