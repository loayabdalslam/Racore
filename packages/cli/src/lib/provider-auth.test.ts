import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AUTH_FILE } from "./app-paths";
import { ProviderId } from "./app-schema";
import {
  clearProviderAuth,
  getProviderAuth,
  isProviderConnected,
  saveProviderApiKey,
} from "./provider-auth";

const BACKUP_FILE = `${AUTH_FILE}.bak-test`;

function restoreAuthFile() {
  rmSync(AUTH_FILE, { force: true });
  if (existsSync(BACKUP_FILE)) {
    renameSync(BACKUP_FILE, AUTH_FILE);
  }
}

describe("provider auth", () => {
  beforeEach(() => {
    mkdirSync(dirname(AUTH_FILE), { recursive: true });
    restoreAuthFile();

    if (existsSync(AUTH_FILE)) {
      renameSync(AUTH_FILE, BACKUP_FILE);
    }
  });

  afterEach(() => {
    restoreAuthFile();
  });

  it("saves and loads the OpenRouter API key safely", () => {
    saveProviderApiKey(ProviderId.OPENROUTER, "or-key");

    expect(getProviderAuth(ProviderId.OPENROUTER).apiKey).toBe("or-key");
    expect(isProviderConnected(ProviderId.OPENROUTER)).toBe(true);
  });

  it("clears OpenRouter credentials", () => {
    saveProviderApiKey(ProviderId.OPENROUTER, "or-key");

    clearProviderAuth(ProviderId.OPENROUTER);

    expect(getProviderAuth(ProviderId.OPENROUTER).apiKey).toBeUndefined();
  });

  it("persists valid OpenRouter-only auth json", () => {
    saveProviderApiKey(ProviderId.OPENROUTER, "or-key");
    const raw = readFileSync(AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([ProviderId.OPENROUTER]);
  });
});
