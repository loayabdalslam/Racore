import { z } from "zod";

export const Mode = {
  BUILD: "BUILD",
  PLAN: "PLAN",
  ULTRA: "ULTRA",
} as const;

export const ProviderId = {
  OPENAI: "openai",
  OPENROUTER: "openrouter",
  GROQ: "groq",
  XAI: "xai",
  DEEPSEEK: "deepseek",
} as const;

export type ModeType = (typeof Mode)[keyof typeof Mode];
export type ProviderIdType = (typeof ProviderId)[keyof typeof ProviderId];

export const modeSchema = z.enum([Mode.BUILD, Mode.PLAN, Mode.ULTRA]);
export const providerIdSchema = z.enum([
  ProviderId.OPENAI,
  ProviderId.OPENROUTER,
  ProviderId.GROQ,
  ProviderId.XAI,
  ProviderId.DEEPSEEK,
]);

export type ProviderModel = {
  id: string;
  provider: ProviderIdType;
  label: string;
  capability: string;
  recommended?: boolean;
};

export const toolInputSchemas = {
  readFile: z.object({
    path: z.string().describe("Relative path to the file to read"),
  }),
  listDirectory: z.object({
    path: z.string().default(".").describe("Relative directory path to list"),
  }),
  glob: z.object({
    pattern: z.string().describe("Glob pattern to match files"),
    path: z.string().default(".").describe("Directory to search from"),
  }),
  grep: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().default(".").describe("Directory to search from"),
    include: z.string().optional().describe("Optional glob for files to include"),
  }),
  readManyFiles: z.object({
    paths: z.array(z.string()).min(1).max(12).describe("Relative file paths to read"),
  }),
  grepManyPatterns: z.object({
    queries: z.array(
      z.object({
        pattern: z.string(),
        path: z.string().default("."),
        include: z.string().optional(),
      }),
    ).min(1).max(8),
  }),
  writeFile: z.object({
    path: z.string().describe("Relative path to write"),
    content: z.string().describe("File contents"),
  }),
  writeManyFiles: z.object({
    files: z.array(
      z.object({
        path: z.string(),
        content: z.string(),
      }),
    ).min(1).max(8),
  }),
  editFile: z.object({
    path: z.string().describe("Relative path to edit"),
    oldString: z.string().describe("Exact text to replace; must be unique"),
    newString: z.string().describe("Replacement text"),
  }),
  bash: z.object({
    command: z.string().describe("Shell command to run"),
    description: z.string().optional().describe("Short description of the command"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  invokeAI: z.object({
    task: z.string().describe("A focused subtask for a parallel AI pass"),
    context: z.string().optional().describe("Optional extra context for the subtask"),
  }),
} as const;

export type MessageMetadata = {
  mode?: ModeType;
  model?: string;
  provider?: ProviderIdType;
  durationMs?: number;
};

export type TextPart = {
  type: "text";
  text: string;
};

export type ReasoningPart = {
  type: "reasoning";
  text: string;
};

export type ToolMessagePart = {
  type: `tool-${string}`;
  toolCallId: string;
  input?: Record<string, unknown>;
  output?: unknown;
  state?: "input-available" | "output-available" | "output-error";
  errorText?: string;
};

export type MessagePart = TextPart | ReasoningPart | ToolMessagePart;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  metadata?: MessageMetadata;
};

export type SessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ProviderAuthState = {
  apiKey?: string;
  connectedAt?: string;
  authType?: "oauth" | "api-key";
};

export type AuthState = Record<ProviderIdType, ProviderAuthState>;

export type AppConfig = {
  activeProvider: ProviderIdType;
  modelByProvider: Record<ProviderIdType, string>;
  mode: ModeType;
};
