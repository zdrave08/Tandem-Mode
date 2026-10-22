// Source of truth for UI messages. `sr.ts` must define every key declared here.
// Placeholders are written as {name} and filled in by `t()`.
export const en = {
  helpText: `Commands:
  /plan <task>                                planner/worker/reviewer orchestration
  /model [deepseek-v4-pro|deepseek-v4-flash]  show or change the model
  /thinking [on|off]                          toggle thinking mode
  /effort [low|high|max]                      show or change reasoning effort
  /status                                     current settings and session
  /diff [--staged] [path]                     show the working-tree diff (no API call)
  /usage                                      token usage, estimated cost, off-peak projection
  /budget [amount]                            show or set the budget in USD
  /new                                        new session
  /fork                                       new session with a copy of the current history
  /resume [id]                                resume the latest or a specific session
  /paste [message]                            send an image from the clipboard
  /clear                                      clear the screen
  /help                                       this list
  /exit                                       exit`,

  usageLine: "Usage: {syntax}",
  unknownCommand: "Unknown command: /{cmd}. Type /help.",

  modelCurrent: "Current model: {model}",
  effortCurrent: "Current effort: {effort}",

  statusSession: "Session: {id}",
  statusBudget: "Budget: {value}",
  statusNotSet: "not set",
  statusVerify: "Verify command: {value}",
  statusVerifyNone: "not set",
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

  toolDenied: " (denied)",
  toolMoreLines: " … ({count} lines)",
  destructiveAction: "Destructive action: {call}",
  approvalHint: "y = allow, n = deny, a = always allow this tool for this session (answer below)",
  approvalPrompt: "Allow {call}? (y/n/a — a = always allow this tool)",
  autoApproved: "[--yes] auto-approved: {call}",
  errorPrefix: "Error: {message}",
  maxIterations: "Reached the maximum number of iterations without a final answer.",
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

  clipboardCmdNotFound: 'Command "{cmd}" not found. {hint}',
  clipboardInstallWl: "Install wl-clipboard (e.g. sudo apt install wl-clipboard).",
  clipboardInstallXclip: "Install xclip (e.g. sudo apt install xclip).",
  clipboardUnsupported: 'Pasting an image from the clipboard is not supported on platform "{platform}".',
};

export type MessageKey = keyof typeof en;
