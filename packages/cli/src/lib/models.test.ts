import { describe, expect, it } from "bun:test";
import { ProviderId } from "./app-schema";
import { getDefaultModel, getProviderModels, mergeProviderModels, toOpenRouterToolModels } from "./models";

describe("models", () => {
  it("has at least one model for every provider", () => {
    for (const provider of Object.values(ProviderId)) {
      expect(getProviderModels(provider).length).toBeGreaterThan(0);
    }
  });

  it("returns a default model that belongs to the requested provider", () => {
    for (const provider of Object.values(ProviderId)) {
      const model = getDefaultModel(provider);
      expect(model.provider).toBe(provider);
    }
  });

  it("merges fetched OpenRouter models without dropping builtin metadata", () => {
    const merged = mergeProviderModels(
      [
        {
          id: "openai/gpt-5",
          provider: ProviderId.OPENROUTER,
          label: "GPT-5 via OpenRouter",
          capability: "Builtin",
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

    expect(merged.find((item) => item.id === "openai/gpt-5")?.capability).toBe("Fetched");
    expect(merged.some((item) => item.id === "google/gemini-2.5-pro")).toBe(true);
  });

  it("keeps only OpenRouter models that advertise tool support", () => {
    const mapped = toOpenRouterToolModels([
      {
        id: "minimax/minimax-m2.5:free",
        name: "MiniMax M2.5 Free",
        supported_parameters: ["reasoning"],
      },
      {
        id: "openai/gpt-5",
        name: "GPT-5",
        supported_parameters: ["tools", "tool_choice"],
      },
    ]);

    expect(mapped.map((model) => model.id)).toEqual(["openai/gpt-5"]);
  });

  it("keeps free OpenRouter models when they advertise tool support", () => {
    const mapped = toOpenRouterToolModels([
      {
        id: "google/gemma-4-26b-a4b-it:free",
        name: "Gemma Free",
        supported_parameters: ["tools"],
      },
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        supported_parameters: ["tools"],
      },
    ]);

    expect(mapped.map((model) => model.id)).toEqual([
      "google/gemma-4-26b-a4b-it:free",
      "anthropic/claude-sonnet-4",
    ]);
  });
});
