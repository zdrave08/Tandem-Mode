import {
  createSession,
  findLatestSession,
  findSessionById,
  loadSessionMessages,
  appendSessionMessage,
} from "../agent/session.js";
import { gitDiffTool } from "../agent/tools/gitDiff.js";
import type { RuntimeState } from "./state.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { t } from "../i18n/index.js";

export type CommandOutcome = "continue" | "exit";

export async function handleCommand(line: string, state: RuntimeState): Promise<CommandOutcome> {
  const [cmd = "", ...rest] = line.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
      console.log(t("helpText"));
      return "continue";

    case "exit":
    case "quit":
      return "exit";

    case "model":
      if (arg === "deepseek-v4-pro" || arg === "deepseek-v4-flash") {
        state.model = arg;
        console.log(`Model: ${arg}`);
      } else if (!arg) {
        console.log(t("modelCurrent", { model: state.model }));
      } else {
        console.log(t("usageLine", { syntax: "/model deepseek-v4-pro|deepseek-v4-flash" }));
      }
      return "continue";

    case "thinking":
      if (arg === "on" || arg === "off") {
        state.thinkingEnabled = arg === "on";
        console.log(`Thinking: ${arg}`);
      } else if (!arg) {
        console.log(`Thinking: ${state.thinkingEnabled ? "on" : "off"}`);
      } else {
        console.log(t("usageLine", { syntax: "/thinking on|off" }));
      }
      return "continue";

    case "effort":
      if (arg === "low" || arg === "high" || arg === "max") {
        state.reasoningEffort = arg;
        console.log(`Reasoning effort: ${arg}`);
      } else if (!arg) {
        console.log(t("effortCurrent", { effort: state.reasoningEffort }));
      } else {
        console.log(t("usageLine", { syntax: "/effort low|high|max" }));
      }
      return "continue";

    case "status": {
      console.log(t("statusSession", { id: state.session.id }));
      console.log(`Model: ${state.model}`);
      console.log(`Thinking: ${state.thinkingEnabled ? `on (${state.reasoningEffort})` : "off"}`);
      console.log(t("statusBudget", { value: state.budgetUsd !== undefined ? `$${state.budgetUsd.toFixed(2)}` : t("statusNotSet") }));
      console.log(`Max review loops: ${state.maxReviewLoops}`);
      console.log(t("statusVerify", { value: state.verifyCommand ?? t("statusVerifyNone") }));
      console.log(t("statusMessages", { count: state.messages.length }));
      return "continue";
    }

    case "diff": {
      const staged = rest[0] === "--staged";
      const scopePath = (staged ? rest.slice(1) : rest).join(" ").trim();
      const result = await gitDiffTool.execute(
        { staged, ...(scopePath ? { path: scopePath } : {}) },
        { cwd: state.cwd, env: state.env, usage: state.usage }
      );
      console.log(result.output);
      return "continue";
    }

    case "usage": {
      const totals = state.usage.totals();
      const cost = state.usage.estimatedCostUsd();
      const offPeakCost = state.usage.offPeakEquivalentCostUsd();
      console.log(t("usageCalls", { count: state.usage.callCount }));
      console.log(
        t("usageTokens", { input: totals.promptTokens, cached: totals.promptCacheHitTokens, output: totals.completionTokens })
      );
      console.log(t("usageCost", { cost: `$${cost.toFixed(4)}` }));
      if (Math.abs(cost - offPeakCost) > 0.0000001) {
        console.log(t("usageOffPeak", { cost: `$${offPeakCost.toFixed(4)}` }));
      }
      if (state.budgetUsd !== undefined) {
        console.log(
          t("usageBudget", { budget: `$${state.budgetUsd.toFixed(2)}`, percent: ((cost / state.budgetUsd) * 100).toFixed(0) })
        );
      }
      return "continue";
    }

    case "budget":
      if (arg) {
        const n = Number(arg);
        if (Number.isFinite(n) && n > 0) {
          state.budgetUsd = n;
          console.log(t("budgetSet", { amount: `$${n.toFixed(2)}` }));
        } else {
          console.log(t("usageLine", { syntax: "/budget <USD>" }));
        }
      } else {
        console.log(
          state.budgetUsd !== undefined ? t("budgetCurrent", { amount: `$${state.budgetUsd.toFixed(2)}` }) : t("budgetNone")
        );
      }
      return "continue";

    case "new": {
      state.session = await createSession(state.cwd);
      const systemMsg = { role: "system" as const, content: SYSTEM_PROMPT };
      state.messages = [systemMsg];
      await appendSessionMessage(state.session, systemMsg);
      console.log(t("sessionNew", { id: state.session.id }));
      return "continue";
    }

    case "fork": {
      const forked = await createSession(state.cwd);
      for (const msg of state.messages) {
        await appendSessionMessage(forked, msg);
      }
      state.session = forked;
      console.log(t("sessionForked", { id: forked.id, count: state.messages.length }));
      return "continue";
    }

    case "resume": {
      const target = arg ? await findSessionById(state.cwd, arg) : await findLatestSession(state.cwd);
      if (!target) {
        console.log(arg ? t("sessionNotFound", { id: arg }) : t("sessionNoneInDir"));
        return "continue";
      }
      state.messages = await loadSessionMessages(target.filePath);
      state.session = target;
      console.log(t("sessionResumed", { id: target.id, count: state.messages.length }));
      return "continue";
    }

    case "clear":
      console.clear();
      return "continue";

    default:
      console.log(t("unknownCommand", { cmd }));
      return "continue";
  }
}
