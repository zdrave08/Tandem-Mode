// Source of truth for UI messages. `sr.ts` must define every key declared here.
// Placeholders are written as {name} and filled in by `t()`.
export const en = {
  helpText: `Commands:
  /plan <task>                                planner/worker/reviewer orchestration for one task
  /mode [chat|plan]                           stay in plan mode: every message is planned, executed and reviewed
  /model [deepseek-v4-pro|deepseek-v4-flash]  show or change the model
  /thinking [on|off]                          toggle thinking mode
  /effort [low|high|max]                      show or change reasoning effort
  /status                                     current settings and session
  /diff [--staged] [path]                     show the working-tree diff (no API call)
  /usage                                      token usage, estimated cost, off-peak projection
  /budget [amount]                            show or set the budget in USD
  /new                                        new session
  /save-profile <name>                        save model, effort, budget and review loops as a profile
  /profile [name]                             load a saved profile, or list them
  /compact                                    summarize the history into a new session to free up context
  /fork                                       new session with a copy of the current history
  /resume [id]                                resume the latest or a specific session
  /paste [message]                            send an image from the clipboard
  /clear                                      clear the screen
  /help                                       this list
  /exit                                       exit`,

  usageLine: "Usage: {syntax}",
  unknownCommand: "Unknown command: /{cmd}. Type /help.",

  modelCurrent: "Current model: {model}",
  modeCurrent: "Mode: {mode} (/mode chat or /mode plan to change)",
  modeSetPlan:
    "Plan mode on: every message is planned by v4-pro, executed by v4-flash and reviewed by v4-pro. /mode chat goes back to a single model.",
  modeSetChat: "Chat mode: messages go straight to {model}.",
  promptModePlan: "PLAN: v4-pro plans · v4-flash executes",
  promptToggleToPlan: "Shift+Tab: plan",
  promptToggleToChat: "Shift+Tab: chat",
  effortCurrent: "Current effort: {effort}",

  statusSession: "Session: {id}",
  statusBudget: "Budget: {value}",
  statusNotSet: "not set",
  statusVerify: "Verify command: {value}",
  statusVerifyNone: "not set",
  statusNotify: "Notify command: {value}",
  statusMessages: "Messages in history: {count}",

  usageCalls: "Calls: {count}",
  usageTokens: "Tokens: {input} in ({cached} cached) / {output} out",
  usageCost: "Estimated cost: {cost}",
  usageOffPeak: "This session would cost {cost} off-peak",
  usageBudget: "Budget: {budget} ({percent}% used)",

  budgetSet: "Budget set to {amount}.",
  budgetCurrent: "Current budget: {amount}",
  budgetNone: "No budget set.",

  sessionNew: "New session: {id}",
  sessionForked: "Session forked: {id} ({count} messages carried over, original session untouched)",
  sessionNotFound: "Session '{id}' not found.",
  sessionNoneInDir: "No previous session in this directory.",
  sessionResumed: "Resumed session: {id} ({count} messages)",

  compactNothing: "Nothing to compact yet.",
  compactWorking: "Compacting {count} messages...",
  compactDone:
    "Compacted {before} messages into {after}. New session: {id} (previous session {previous} is untouched on disk)",
  compactFailed: "Compaction failed, history unchanged: {message}",

  profileInvalidName: "Profile names use a-z, 0-9, - and _ (up to 40 characters, starting with a letter or digit).",
  profileSaved: "Profile '{name}' saved to {path}",
  profileLoaded: "Loaded profile '{name}': {summary}",
  profileNotFound: "Profile '{name}' not found. Type /profile to list saved profiles.",
  profileInvalid: "Profile '{name}' is invalid: {reason}",
  profileList: "Saved profiles: {names}",
  profileNone: "No saved profiles. Save the current settings with /save-profile <name>.",

  toolDenied: " (denied)",
  toolMoreLines: " … ({count} lines)",
  destructiveAction: "Destructive action: {call}",
  approvalHint: "y = allow, n = deny, a = always allow this tool for this session (answer below)",
  approvalPrompt: "Allow {call}? (y/n/a — a = always allow this tool)",
  autoApproved: "[--yes] auto-approved: {call}",
  promptThinkingOn: "thinking {effort}",
  promptThinkingOff: "thinking off",
  promptBudget: "budget {value}",
  promptHint: "Enter send · Alt+Enter new line · Tab complete · Ctrl+C clear/quit",
  approvalTitleEdit: "Edit {path}",
  approvalTitleShell: "Run command",
  approvalTitleTool: "{tool}",
  approvalTitleContinue: "Keep going?",
  approvalQuestionEdit: "Apply this change?",
  approvalQuestionShell: "Run this command?",
  approvalQuestionTool: "Allow {tool}?",
  approvalQuestionContinue: "Continue for {chunk} more calls?",
  approvalYes: "Yes",
  approvalAlways: "Yes, and don't ask again for {tool} this session",
  approvalAlwaysContinue: "Yes, and always continue in this session",
  approvalNo: "No",
  approvalMenuHint: "↑/↓ choose · Enter confirm · 1 2 3 or y a n · Esc deny",
  retrying: "Connection problem ({reason}). Retry {attempt}/{max} in {seconds}s…",
  errorSessionSaved: "The session is saved: send a message (e.g. \"continue\") to pick up where it stopped.",
  errorPrefix: "Error: {message}",
  maxIterations:
    "Reached the maximum number of iterations without a final answer. The session is saved: send a message (e.g. \"continue\") to pick up where it stopped.",
  continueAsk: "The agent used {n} calls and has not finished.",
  continueHint: "y = continue for {chunk} more calls, n = stop, a = always continue in this session (answer below)",
  continuePrompt: "Continue for {chunk} more calls? (y/n/a — a = always continue this session)",
  autoContinued: "[auto-continue] {n} calls used, continuing (spent ~{spent} of {budget})",
  autoContinueNeedsBudget:
    "autoContinue only works together with a budget (--budget or budgetUsd); without one the agent will ask before continuing.",
  continueStopped: "Stopped at the iteration limit (non-interactive run). Re-run with --auto-continue and --budget to let it go on.",
  statusMode_chat: "chat",
  statusMode_plan: "plan",
  statusCalls: "call {n}/{max}",
  budgetExceeded:
    "Budget of {budget} reached (spent ~{spent}). The loop stopped before the next call — the session is saved, raise the budget with /budget and continue.",
  interrupted: "⏹ Interrupted (ESC). The session is saved up to this point.",
  orchestrationInterrupted: "⏹ Orchestration interrupted (ESC).",
  orchestrationError: "Orchestration error: {message}",

  replHint: "/help for commands, /exit to quit.\n",
  peakWarning: "⚠ It is peak time (01–04h or 06–10h UTC) — prices are double the off-peak rate.\n",
  waitForTurn: "Wait for the current turn to finish.",
  pasteNoImage: "No image in the clipboard.",

  noApiKey:
    "No DeepSeek API key. Set the DEEPSEEK_API_KEY environment variable, or run tandem interactively to go through the first-run wizard.",
  keyNotSaved: "The key was not saved correctly — try again.",
  noSessionToResume: "No previous session to resume in this directory.",

  wizardIntro: "First run — a DeepSeek API key is required.\n",
  wizardLanguage: "Language:",
  wizardApiKey: "DeepSeek API key:",
  wizardKeyEmpty: "The key cannot be empty.",
  wizardModel: "Default model:",
  wizardModelPro: "deepseek-v4-pro (stronger, pricier)",
  wizardModelFlash: "deepseek-v4-flash (faster, cheaper)",
  wizardEffort: "Default reasoning effort:",
  wizardSaved: "\nSaved — the key is in the OS credential store, settings in ~/.tandem/config.json.\n",

  orchPlanning: "\n📋 Planning...\n",
  orchPlan: "Plan: {summary}",
  orchWorker: "\n🔧 Worker: {description}\n",
  orchWorkerCorrection: "\n🔧 Worker (correction): {description}\n",
  orchReviewer: "\n🔍 Reviewer is checking...\n",
  orchVerify: "\n🧪 Verify: {command}\n",
  orchVerifyPassed: "  passed",
  orchVerifyFailed: "  failed (exit {code})",
  orchApproved: "✅ Reviewer approved. {notes}\n",
  orchChangesRequested: "⚠ Reviewer requests changes ({loops}/{max}): {notes}",
  orchMaxLoops: "\n❌ Reached max_review_loops ({max}) without approval — check manually.\n",
  notifyFailed: "⚠ The notification command failed: {reason}",

  clipboardCmdNotFound: 'Command "{cmd}" not found. {hint}',
  clipboardInstallWl: "Install wl-clipboard (e.g. sudo apt install wl-clipboard).",
  clipboardInstallXclip: "Install xclip (e.g. sudo apt install xclip).",
  clipboardUnsupported: 'Pasting an image from the clipboard is not supported on platform "{platform}".',
};

export type MessageKey = keyof typeof en;
