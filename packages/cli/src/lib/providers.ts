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
    id: ProviderId.OPENAI,
    label: "OpenAI / Codex",
    shortLabel: "OpenAI",
    description: "Direct GPT access through OpenAI-compatible API requests.",
    browserLabel: "Open OpenAI dashboard",
    browserUrl: "https://platform.openai.com/",
    envVar: "OPENAI_API_KEY",
    supportsOAuth: true,
    supportsDirectApiKey: true,
    runtime: "openai-compatible",
    authHint: "ChatGPT account login belongs to Codex CLI. Racore OpenAI requests need an API key.",
  },
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
  {
    id: ProviderId.GROQ,
    label: "Groq",
    shortLabel: "Groq",
    description: "Fast OpenAI-compatible inference with very low latency.",
    browserLabel: "Open Groq console",
    browserUrl: "https://console.groq.com/keys",
    envVar: "GROQ_API_KEY",
    supportsOAuth: false,
    supportsDirectApiKey: true,
    runtime: "openai-compatible",
    authHint: "Save a Groq API key locally for direct use in R'a Core.",
  },
  {
    id: ProviderId.XAI,
    label: "xAI",
    shortLabel: "xAI",
    description: "Grok models through an OpenAI-compatible API surface.",
    browserLabel: "Open xAI console",
    browserUrl: "https://console.x.ai/",
    envVar: "XAI_API_KEY",
    supportsOAuth: false,
    supportsDirectApiKey: true,
    runtime: "openai-compatible",
    authHint: "Paste an xAI API key, then choose your Grok model.",
  },
  {
    id: ProviderId.DEEPSEEK,
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    description: "Reasoning- and coding-focused OpenAI-compatible models.",
    browserLabel: "Open DeepSeek platform",
    browserUrl: "https://platform.deepseek.com/api_keys",
    envVar: "DEEPSEEK_API_KEY",
    supportsOAuth: false,
    supportsDirectApiKey: true,
    runtime: "openai-compatible",
    authHint: "Paste a DeepSeek API key for direct reasoning and coding access.",
  },
];

export function getProviderDefinition(provider: ProviderIdType) {
  return PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]!;
}
