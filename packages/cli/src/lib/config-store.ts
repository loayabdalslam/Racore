import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE, ensureAppDirectories } from "./app-paths";
import { Mode, ProviderId, type AppConfig } from "./app-schema";
import { getDefaultModel } from "./models";

export function getDefaultConfig(): AppConfig {
  return {
    activeProvider: ProviderId.OPENAI,
    modelByProvider: {
      [ProviderId.OPENAI]: getDefaultModel(ProviderId.OPENAI).id,
      [ProviderId.OPENROUTER]: getDefaultModel(ProviderId.OPENROUTER).id,
      [ProviderId.GROQ]: getDefaultModel(ProviderId.GROQ).id,
      [ProviderId.XAI]: getDefaultModel(ProviderId.XAI).id,
      [ProviderId.DEEPSEEK]: getDefaultModel(ProviderId.DEEPSEEK).id,
    },
    mode: Mode.BUILD,
  };
}

export function loadConfig(): AppConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return getDefaultConfig();
    }

    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<AppConfig>;
    const defaults = getDefaultConfig();

    return {
      activeProvider: parsed.activeProvider ?? defaults.activeProvider,
      modelByProvider: {
        ...defaults.modelByProvider,
        ...parsed.modelByProvider,
      },
      mode: parsed.mode ?? defaults.mode,
    };
  } catch {
    return getDefaultConfig();
  }
}

export function saveConfig(config: AppConfig) {
  ensureAppDirectories();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
}
