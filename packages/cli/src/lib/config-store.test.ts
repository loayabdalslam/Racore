import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG_FILE } from "./app-paths";
import { Mode, ProviderId } from "./app-schema";
import { getDefaultConfig, loadConfig, saveConfig } from "./config-store";

const BACKUP_FILE = `${CONFIG_FILE}.bak-test`;

function restoreConfigFile() {
  rmSync(CONFIG_FILE, { force: true });
  if (existsSync(BACKUP_FILE)) {
    renameSync(BACKUP_FILE, CONFIG_FILE);
  }
}

describe("config store", () => {
  beforeEach(() => {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    restoreConfigFile();

    if (existsSync(CONFIG_FILE)) {
      renameSync(CONFIG_FILE, BACKUP_FILE);
    }
  });

  afterEach(() => {
    restoreConfigFile();
  });

  it("returns a complete default config with every provider model", () => {
    const config = getDefaultConfig();

    expect(config.activeProvider).toBe(ProviderId.OPENAI);
    expect(config.mode).toBe(Mode.BUILD);
    expect(config.modelByProvider).toHaveProperty(ProviderId.OPENAI);
    expect(config.modelByProvider).toHaveProperty(ProviderId.OPENROUTER);
    expect(config.modelByProvider).toHaveProperty(ProviderId.GROQ);
    expect(config.modelByProvider).toHaveProperty(ProviderId.XAI);
    expect(config.modelByProvider).toHaveProperty(ProviderId.DEEPSEEK);
  });

  it("round-trips a saved config", () => {
    saveConfig({
      activeProvider: ProviderId.OPENROUTER,
      mode: Mode.ULTRA,
      modelByProvider: {
        ...getDefaultConfig().modelByProvider,
        [ProviderId.OPENROUTER]: "openai/gpt-5",
      },
    });

    const loaded = loadConfig();
    expect(loaded.activeProvider).toBe(ProviderId.OPENROUTER);
    expect(loaded.mode).toBe(Mode.ULTRA);
    expect(loaded.modelByProvider[ProviderId.OPENROUTER]).toBe("openai/gpt-5");
  });
});
