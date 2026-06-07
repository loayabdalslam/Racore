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

  it("returns an OpenRouter-only default config", () => {
    const config = getDefaultConfig();

    expect(config.activeProvider).toBe(ProviderId.OPENROUTER);
    expect(config.mode).toBe(Mode.BUILD);
    expect(Object.keys(config.modelByProvider)).toEqual([ProviderId.OPENROUTER]);
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

  it("falls back when the saved provider model is no longer available", () => {
    saveConfig({
      activeProvider: ProviderId.OPENROUTER,
      mode: Mode.PLAN,
      modelByProvider: {
        ...getDefaultConfig().modelByProvider,
        [ProviderId.OPENROUTER]: "missing/provider-model",
      },
    });

    const loaded = loadConfig();
    expect(loaded.modelByProvider[ProviderId.OPENROUTER]).toBe(getDefaultConfig().modelByProvider[ProviderId.OPENROUTER]);
  });
});
