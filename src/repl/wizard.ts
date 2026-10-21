import { password, select } from "@inquirer/prompts";
import { setStoredApiKey } from "../config/credentials.js";
import { saveGlobalConfig } from "../config/store.js";
import type { TandemConfig } from "../config/schema.js";
import { LANGUAGES, setLanguage, t, type Language } from "../i18n/index.js";

export async function runFirstRunWizard(): Promise<TandemConfig> {
  // Bilingual on purpose: asked before the language is known.
  const language = await select<Language>({
    message: "Language / Jezik:",
    choices: LANGUAGES.map((value) => ({ name: value === "en" ? "English" : "Srpski", value })),
    default: "en",
  });
  setLanguage(language);

  console.log(t("wizardIntro"));

  const apiKey = await password({
    message: t("wizardApiKey"),
    mask: "*",
    validate: (value) => (value.trim().length > 0 ? true : t("wizardKeyEmpty")),
  });

  const defaultModel = await select<"deepseek-v4-pro" | "deepseek-v4-flash">({
    message: t("wizardModel"),
    choices: [
      { name: t("wizardModelPro"), value: "deepseek-v4-pro" },
      { name: t("wizardModelFlash"), value: "deepseek-v4-flash" },
    ],
    default: "deepseek-v4-pro",
  });

  const defaultReasoningEffort = await select<"low" | "high" | "max">({
    message: t("wizardEffort"),
    choices: [
      { name: "low", value: "low" },
      { name: "high", value: "high" },
      { name: "max", value: "max" },
    ],
    default: "high",
  });

  await setStoredApiKey(apiKey.trim());
  const config: TandemConfig = { defaultModel, defaultReasoningEffort, language };
  await saveGlobalConfig(config);

  console.log(t("wizardSaved"));
  return config;
}
