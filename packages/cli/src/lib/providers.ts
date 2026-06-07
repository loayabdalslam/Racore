import { ProviderId, type ProviderIdType } from "./app-schema";

export type ProviderDefinition = {
  id: ProviderIdType;
  label: string;
  shortLabel: string;
  description: string;
  browserLabel: string;
  browserUrl: string;
  envVar: string;
  supportsOAuth: boolean;
  supportsDirectApiKey: boolean;
  runtime: "openai-compatible";
  authHint: string;
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: ProviderId.OPENROUTER,
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    description: "Unified routing for OpenAI, Anthropic, and more through one key.",
    browserLabel: "Open OpenRouter dashboard",
    browserUrl: "https://openrouter.ai/settings/keys",
    envVar: "OPENROUTER_API_KEY",
    supportsOAuth: true,
    supportsDirectApiKey: true,
    runtime: "openai-compatible",
    authHint: "OAuth can create a local key automatically, or you can paste a key yourself.",
  },
];

export function getProviderDefinition(provider: ProviderIdType) {
  return PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]!;
}
