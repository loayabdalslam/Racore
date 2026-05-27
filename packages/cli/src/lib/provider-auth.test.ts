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

  it("saves and loads API keys for every provider safely", () => {
    saveProviderApiKey(ProviderId.OPENROUTER, "or-key");
    saveProviderApiKey(ProviderId.OPENAI, "oa-key");
    saveProviderApiKey(ProviderId.GROQ, "gq-key");

    expect(getProviderAuth(ProviderId.OPENROUTER).apiKey).toBe("or-key");
    expect(getProviderAuth(ProviderId.OPENAI).apiKey).toBe("oa-key");
    expect(getProviderAuth(ProviderId.GROQ).apiKey).toBe("gq-key");
    expect(isProviderConnected(ProviderId.OPENROUTER)).toBe(true);
  });

  it("clears a single provider without destroying other providers", () => {
    saveProviderApiKey(ProviderId.OPENROUTER, "or-key");
    saveProviderApiKey(ProviderId.OPENAI, "oa-key");

    clearProviderAuth(ProviderId.OPENROUTER);

    expect(getProviderAuth(ProviderId.OPENROUTER).apiKey).toBeUndefined();
    expect(getProviderAuth(ProviderId.OPENAI).apiKey).toBe("oa-key");
  });

  it("persists valid json with all provider keys present", () => {
    saveProviderApiKey(ProviderId.DEEPSEEK, "ds-key");
    const raw = readFileSync(AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(parsed).toHaveProperty("openai");
    expect(parsed).toHaveProperty("openrouter");
    expect(parsed).toHaveProperty("groq");
    expect(parsed).toHaveProperty("xai");
    expect(parsed).toHaveProperty("deepseek");
  });
});
