import { describe, expect, it } from "bun:test";
import { ProviderId } from "./app-schema";
import { getDefaultModel, getProviderModels, mergeProviderModels } from "./models";

describe("models", () => {
  it("has at least one model for every provider", () => {
    const providers = [
      ProviderId.OPENAI,
      ProviderId.OPENROUTER,
      ProviderId.GROQ,
      ProviderId.XAI,
      ProviderId.DEEPSEEK,
    ];

    for (const provider of providers) {
      expect(getProviderModels(provider).length).toBeGreaterThan(0);
    }
  });

  it("returns a default model that belongs to the requested provider", () => {
    const providers = [
      ProviderId.OPENAI,
      ProviderId.OPENROUTER,
      ProviderId.GROQ,
      ProviderId.XAI,
      ProviderId.DEEPSEEK,
    ];

    for (const provider of providers) {
      const model = getDefaultModel(provider);
      expect(model.provider).toBe(provider);
    }
  });

  it("merges fetched OpenRouter models without dropping builtin recommended models", () => {
    const merged = mergeProviderModels(
      [
        {
          id: "openai/gpt-5",
          provider: ProviderId.OPENROUTER,
          label: "GPT-5 via OpenRouter",
          capability: "Builtin",
          recommended: true,
        },
      ],
      [
        {
          id: "openai/gpt-5",
          provider: ProviderId.OPENROUTER,
          label: "GPT-5",
          capability: "Fetched",
        },
        {
          id: "google/gemini-2.5-pro",
          provider: ProviderId.OPENROUTER,
          label: "Gemini 2.5 Pro",
          capability: "Fetched",
        },
      ],
    );

    expect(merged.find((item) => item.id === "openai/gpt-5")?.recommended).toBe(true);
    expect(merged.some((item) => item.id === "google/gemini-2.5-pro")).toBe(true);
  });
});
