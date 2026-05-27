import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureAppDirectories, MODELS_FILE } from "./app-paths";
import { ProviderId, type ProviderIdType, type ProviderModel } from "./app-schema";

type StoredModelsState = Partial<Record<ProviderIdType, ProviderModel[]>>;

export const BUILTIN_PROVIDER_MODELS: ProviderModel[] = [
  {
    id: "gpt-5.4",
    provider: ProviderId.OPENAI,
    label: "GPT-5.4",
    capability: "Strong coding and planning",
    recommended: true,
  },
  {
    id: "gpt-5.4-mini",
    provider: ProviderId.OPENAI,
    label: "GPT-5.4 Mini",
    capability: "Faster lower-cost coding",
  },
  {
    id: "openai/gpt-5",
    provider: ProviderId.OPENROUTER,
    label: "GPT-5 via OpenRouter",
    capability: "Broad routing and unified billing",
    recommended: true,
  },
  {
    id: "anthropic/claude-sonnet-4",
    provider: ProviderId.OPENROUTER,
    label: "Claude Sonnet 4 via OpenRouter",
    capability: "Reliable code editing and analysis",
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: ProviderId.GROQ,
    label: "Llama 3.3 70B",
    capability: "Fast coding, reasoning, and chat",
    recommended: true,
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    provider: ProviderId.GROQ,
    label: "DeepSeek R1 Distill 70B",
    capability: "Quick reasoning with Groq latency",
  },
  {
    id: "grok-code-fast-1",
    provider: ProviderId.XAI,
    label: "Grok Code Fast 1",
    capability: "Fast code generation and edits",
    recommended: true,
  },
  {
    id: "grok-4-0709",
    provider: ProviderId.XAI,
    label: "Grok 4",
    capability: "Broad reasoning and coding support",
  },
  {
    id: "deepseek-chat",
    provider: ProviderId.DEEPSEEK,
    label: "DeepSeek Chat",
    capability: "Balanced everyday coding and editing",
    recommended: true,
  },
  {
    id: "deepseek-reasoner",
    provider: ProviderId.DEEPSEEK,
    label: "DeepSeek Reasoner",
    capability: "Stronger long-form reasoning and debugging",
  },
];

function loadStoredModelsState(): StoredModelsState {
  try {
    if (!existsSync(MODELS_FILE)) {
      return {};
    }

    return JSON.parse(readFileSync(MODELS_FILE, "utf8")) as StoredModelsState;
  } catch {
    return {};
  }
}

function saveStoredModelsState(state: StoredModelsState) {
  ensureAppDirectories();
  writeFileSync(MODELS_FILE, JSON.stringify(state, null, 2), "utf8");
}

export function mergeProviderModels(
  builtinModels: ProviderModel[],
  fetchedModels: ProviderModel[],
) {
  const byId = new Map<string, ProviderModel>();

  for (const model of builtinModels) {
    byId.set(model.id, model);
  }

  for (const model of fetchedModels) {
    const existing = byId.get(model.id);
    byId.set(model.id, {
      ...existing,
      ...model,
      recommended: existing?.recommended ?? model.recommended,
    });
  }

  return [...byId.values()];
}

export function getProviderModels(provider: ProviderIdType) {
  const builtinModels = BUILTIN_PROVIDER_MODELS.filter((model) => model.provider === provider);
  const storedModels = loadStoredModelsState()[provider] ?? [];
  return mergeProviderModels(builtinModels, storedModels);
}

export function getDefaultModel(provider: ProviderIdType) {
  const models = getProviderModels(provider);
  return models.find((model) => model.recommended) ?? models[0]!;
}

export function getModelById(modelId: string) {
  return [...BUILTIN_PROVIDER_MODELS, ...Object.values(loadStoredModelsState()).flat()].find(
    (model) => model.id === modelId,
  );
}

export async function refreshOpenRouterModels(apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      description?: string;
      supported_parameters?: string[];
    }>;
  };

  const fetchedModels = (payload.data ?? [])
    .filter((item) => !!item.id)
    .map((item, index) => ({
      id: item.id,
      provider: ProviderId.OPENROUTER,
      label: item.name?.trim() || item.id,
      capability: item.description?.trim() || "OpenRouter available model",
      recommended: index === 0 ? undefined : undefined,
    } satisfies ProviderModel));

  const currentState = loadStoredModelsState();
  currentState[ProviderId.OPENROUTER] = fetchedModels;
  saveStoredModelsState(currentState);

  return mergeProviderModels(
    BUILTIN_PROVIDER_MODELS.filter((model) => model.provider === ProviderId.OPENROUTER),
    fetchedModels,
  );
}
