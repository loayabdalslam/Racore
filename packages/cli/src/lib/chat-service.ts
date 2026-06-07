import { APICallError, generateText, streamText, stepCountIs, tool, type ModelMessage, type StepResult, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  Mode,
  ProviderId,
  toolInputSchemas,
  type ChatMessage,
  type MessageMetadata,
  type ModeType,
} from "./app-schema";
import { formatAgentAccelerationContext, getAgentAccelerationContext } from "./agent-accelerator";
import { executeLocalTool } from "./local-tools";
import { getModelCapabilities, getProviderModels } from "./models";
import { getProviderAuth } from "./provider-auth";

const FAST_OPENROUTER_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "meta-llama/llama-3.1-8b-instruct:free",
];

function buildSystemPrompt(mode: ModeType, useTools: boolean, accelerationContext?: string | null) {
  if (!useTools) {
    return "You are R'a Core. Reply briefly and directly.";
  }

  const speedProtocol = [
    "Speed protocol:",
    "Use the fast workspace context before broad exploration.",
    "Prefer readManyFiles, grepManyPatterns, affectedTests, and patchFile for compact parallel progress.",
    "Run focused verification before wider commands when tests are inferred.",
  ].join(" ");

  const context = accelerationContext
    ? `\n\n${accelerationContext}`
    : "";

  if (mode === Mode.PLAN) {
    return [
      "You are R'a Core in Plan mode. Inspect carefully. Use only read-only tools. Keep answers concise.",
      speedProtocol,
    ].join(" ") + context;
  }

  if (mode === Mode.ULTRA) {
    return [
      "You are R'a Core in Ultra mode.",
      "Use parallel and batch tools when work spans files.",
      "Treat the repo index as your first map, then launch only the missing reads or checks.",
      "Route small subtasks to invokeAI only when they can run independently.",
      "Keep results coordinated and concise.",
      speedProtocol,
    ].join(" ") + context;
  }

  return [
    "You are R'a Core, a local coding assistant. Use tools only when useful. Prefer precise edits and concise progress.",
    speedProtocol,
  ].join(" ") + context;
}

function getModel(modelId: string) {
  const auth = getProviderAuth(ProviderId.OPENROUTER);
  if (!auth.apiKey) {
    throw new Error("OpenRouter is not connected");
  }

  const openrouter = createOpenRouter({
    apiKey: auth.apiKey,
    appUrl: "https://github.com/loayabdalslam/racore",
    appName: "R'a Core",
  });
  return openrouter.chat(modelId);
}

function readProviderError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const error = "error" in data ? data.error : data;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;

  const message = "message" in error ? error.message : undefined;
  const code = "code" in error ? error.code : undefined;
  const metadata = "metadata" in error ? error.metadata : undefined;
  const raw =
    metadata && typeof metadata === "object" && "raw" in metadata
      ? metadata.raw
      : undefined;
  const retryAfter =
    metadata && typeof metadata === "object" && "retry_after_seconds" in metadata
      ? metadata.retry_after_seconds
      : undefined;

  return [
    typeof code === "string" || typeof code === "number" ? `${code}` : "",
    typeof message === "string" ? message : "",
    typeof raw === "string" ? raw : "",
    typeof retryAfter === "number" ? `Retry after ${Math.ceil(retryAfter)}s.` : "",
  ].filter(Boolean).join(": ") || null;
}

function parseProviderErrorBody(responseBody?: string): string | null {
  if (!responseBody) return null;

  try {
    return readProviderError(JSON.parse(responseBody));
  } catch {
    return responseBody.length > 240 ? `${responseBody.slice(0, 240)}...` : responseBody;
  }
}

function formatChatError(error: unknown, model: string) {
  if (APICallError.isInstance(error)) {
    const providerMessage =
      readProviderError(error.data) ?? parseProviderErrorBody(error.responseBody) ?? error.message;
    const status = error.statusCode ? `HTTP ${error.statusCode}` : "provider error";
    return new Error(`openrouter ${status} for ${model}: ${providerMessage}`);
  }

  if (error instanceof Error && APICallError.isInstance(error.cause)) {
    return formatChatError(error.cause, model);
  }

  if (error instanceof Error) return error;
  return new Error(String(error));
}

function getApiCallError(error: unknown): APICallError | null {
  if (APICallError.isInstance(error)) return error;
  if (error instanceof Error && error.cause) return getApiCallError(error.cause);
  return null;
}

function shouldTryOpenRouterFallback(error: unknown) {
  const apiError = getApiCallError(error);
  return apiError?.statusCode === 429 || (apiError?.statusCode != null && apiError.statusCode >= 500);
}

function shouldTryNextAutoRoutedModel(error: unknown, modelId: string, selectedModel: string) {
  if (modelId === selectedModel) return false;

  const apiError = getApiCallError(error);
  return apiError?.statusCode === 400 || apiError?.statusCode === 404 || apiError?.statusCode === 422;
}

function isNoOutputGeneratedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no output generated/i.test(message) || /check the stream for errors/i.test(message);
}

function shouldRetryWithoutTools(error: unknown) {
  const apiError = getApiCallError(error);
  if (!apiError || apiError.statusCode !== 400) return false;

  const message = [
    readProviderError(apiError.data),
    parseProviderErrorBody(apiError.responseBody),
    apiError.message,
  ].filter(Boolean).join("\n");

  return /invalid_prompt|invalid responses api request|tool|tools|function/i.test(message);
}

function getLatestUserText(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim() ?? "";
}

function isCasualPrompt(text: string) {
  const normalized = text.toLowerCase().trim();
  if (normalized.length > 40) return false;

  return /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|i|test|ping|how are you)[.!? ]*$/.test(normalized);
}

function getOpenRouterCandidateModels(selectedModel: string) {
  const models = getProviderModels(ProviderId.OPENROUTER).map((model) => model.id);
  const selectedIsFree = selectedModel.endsWith(":free");
  const fallbackModels = models.filter((modelId) =>
    selectedIsFree ? modelId.endsWith(":free") : !modelId.endsWith(":free"),
  );

  return [...new Set([selectedModel, ...fallbackModels])]
    .filter(Boolean)
    .slice(0, 3);
}

function shouldUseFastModel(mode: ModeType, text: string) {
  if (mode !== Mode.BUILD) return false;

  const normalized = text.toLowerCase();
  const heavyIntent = /\b(architecture|database|migration|security|auth|refactor|entire|whole|complex|ultra|deep|plan)\b/.test(
    normalized,
  );

  return !heavyIntent && text.length < 1_500;
}

function getRoutedOpenRouterCandidateModels(selectedModel: string, mode: ModeType, text: string) {
  const baseCandidates = getOpenRouterCandidateModels(selectedModel);
  if (!shouldUseFastModel(mode, text)) return baseCandidates;

  const available = new Set(getProviderModels(ProviderId.OPENROUTER).map((model) => model.id));
  const fastCandidates = FAST_OPENROUTER_MODELS.filter((modelId) => available.has(modelId) || !modelId.endsWith(":free"));

  return [...new Set([...baseCandidates, ...fastCandidates])].slice(0, 4);
}

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (message.role === "user") {
      if (text) {
        modelMessages.push({ role: "user", content: text });
      }
      continue;
    }

    const toolParts = message.parts.filter((part) => part.type.startsWith("tool-"));
    if (toolParts.length === 0) {
      if (text) {
        modelMessages.push({ role: "assistant", content: text });
      }
      continue;
    }

    modelMessages.push({
      role: "assistant",
      content: [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...toolParts.map((part) => ({
          type: "tool-call" as const,
          toolCallId: part.toolCallId,
          toolName: part.type.slice("tool-".length),
          input: part.input ?? {},
        })),
      ],
    });

    modelMessages.push({
      role: "tool",
      content: toolParts.map((part) => {
        const rawOutput = part.output ?? part.errorText ?? "";
        const isError = part.state === "output-error";
        return {
          type: "tool-result" as const,
          toolCallId: part.toolCallId,
          toolName: part.type.slice("tool-".length),
          output: typeof rawOutput === "string"
            ? { type: isError ? "error-text" as const : "text" as const, value: rawOutput }
            : { type: isError ? "error-json" as const : "json" as const, value: rawOutput },
          isError,
        };
      }),
    });
  }

  return modelMessages;
}

function buildStreamingParts(reasoningText: string, text: string): ChatMessage["parts"] {
  return [
    reasoningText ? { type: "reasoning" as const, text: reasoningText } : null,
    { type: "text" as const, text },
  ].filter((part): part is ChatMessage["parts"][number] => part !== null);
}

async function streamModelText(params: {
  model: ReturnType<typeof getModel>;
  system: string;
  messages: ModelMessage[];
  maxSteps: number;
  tools?: ToolSet;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  startTime: number;
  streamingMessage: ChatMessage;
  onUpdate?: (message: ChatMessage) => void;
}) {
  let streamedText = "";
  let reasoningText = "";
  let steps: StepResult<ToolSet>[] | null = null;

  if (!params.supportsStreaming) {
    const result = await generateText({
      model: params.model,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      maxSteps: params.maxSteps,
      maxRetries: 0,
    });

    streamedText = result.text;
    if (streamedText) {
      params.streamingMessage.parts = buildStreamingParts("", streamedText);
      params.streamingMessage.metadata = {
        ...params.streamingMessage.metadata,
        durationMs: Date.now() - params.startTime,
      };
      params.onUpdate?.(params.streamingMessage);
    }

    steps = result.steps as StepResult<ToolSet>[];
    return { streamedText, reasoningText, steps };
  }

  const result = streamText({
    model: params.model,
    system: params.system,
    messages: params.messages,
    tools: params.tools,
    stopWhen: stepCountIs(params.maxSteps),
    maxRetries: 0,
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      streamedText += part.text;
      params.streamingMessage.parts = buildStreamingParts(reasoningText, streamedText);
      params.streamingMessage.metadata = {
        ...params.streamingMessage.metadata,
        durationMs: Date.now() - params.startTime,
      };
      params.onUpdate?.(params.streamingMessage);
    } else if (params.supportsReasoning && part.type === "reasoning-delta") {
      reasoningText += part.text;
      params.streamingMessage.parts = buildStreamingParts(reasoningText, streamedText);
      params.streamingMessage.metadata = {
        ...params.streamingMessage.metadata,
        durationMs: Date.now() - params.startTime,
      };
      params.onUpdate?.(params.streamingMessage);
    } else if (part.type === "error") {
      throw part.error;
    }
  }

  steps = await result.steps;
  return { streamedText, reasoningText, steps };
}

export async function submitChat(params: {
  messages: ChatMessage[];
  mode: ModeType;
  model: string;
  onUpdate?: (message: ChatMessage) => void;
}) {
  const startTime = Date.now();
  const coreMessages = toModelMessages(params.messages);
  const latestUserText = getLatestUserText(params.messages);
  const useTools = !isCasualPrompt(latestUserText);
  const maxSteps = !useTools
    ? 1
    : params.mode === Mode.PLAN
      ? 3
      : params.mode === Mode.ULTRA
        ? 10
        : 4;
  const accelerationContext = useTools
    ? await getAgentAccelerationContext({ task: latestUserText, mode: params.mode })
      .then(formatAgentAccelerationContext)
      .catch(() => null)
    : null;
  const useHeavyTools = params.mode === Mode.ULTRA;
  const usePlanningTools = params.mode === Mode.PLAN || params.mode === Mode.ULTRA;

  const modelIds = getRoutedOpenRouterCandidateModels(params.model, params.mode, latestUserText);

  let usedModelId = params.model;
  let usedSupportsReasoning = false;
  let steps: StepResult<ToolSet>[] | null = null;
  let streamedText = "";
  let reasoningText = "";
  const errors: Error[] = [];
  const streamingMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    metadata: {
      mode: params.mode,
      provider: ProviderId.OPENROUTER,
      model: usedModelId,
    },
  };

  for (const modelId of modelIds) {
    usedModelId = modelId;
    const model = getModel(modelId);
    const capabilities = getModelCapabilities(modelId);
    const useModelTools = useTools && capabilities.supportsTools;
    usedSupportsReasoning = capabilities.supportsReasoning;
    streamedText = "";
    reasoningText = "";

    const tools = useModelTools ? {
    ...(usePlanningTools ? {
      agentPlan: tool({
      inputSchema: toolInputSchemas.agentPlan,
      execute: async (input) => executeLocalTool("agentPlan", input, params.mode),
      }),
      repoIndex: tool({
      inputSchema: toolInputSchemas.repoIndex,
      execute: async (input) => executeLocalTool("repoIndex", input, params.mode),
      }),
      searchSymbols: tool({
      inputSchema: toolInputSchemas.searchSymbols,
      execute: async (input) => executeLocalTool("searchSymbols", input, params.mode),
      }),
    } : {}),
    affectedTests: tool({
      inputSchema: toolInputSchemas.affectedTests,
      execute: async (input) => executeLocalTool("affectedTests", input, params.mode),
    }),
    ...(useHeavyTools ? {
      readProjectMemory: tool({
      inputSchema: toolInputSchemas.readProjectMemory,
      execute: async (input) => executeLocalTool("readProjectMemory", input, params.mode),
      }),
      rememberProjectFact: tool({
      inputSchema: toolInputSchemas.rememberProjectFact,
      execute: async (input) => executeLocalTool("rememberProjectFact", input, params.mode),
      }),
    } : {}),
    readFile: tool({
      inputSchema: toolInputSchemas.readFile,
      execute: async (input) => executeLocalTool("readFile", input, params.mode),
    }),
    listDirectory: tool({
      inputSchema: toolInputSchemas.listDirectory,
      execute: async (input) => executeLocalTool("listDirectory", input, params.mode),
    }),
    glob: tool({
      inputSchema: toolInputSchemas.glob,
      execute: async (input) => executeLocalTool("glob", input, params.mode),
    }),
    grep: tool({
      inputSchema: toolInputSchemas.grep,
      execute: async (input) => executeLocalTool("grep", input, params.mode),
    }),
    readManyFiles: tool({
      inputSchema: toolInputSchemas.readManyFiles,
      execute: async (input) => executeLocalTool("readManyFiles", input, params.mode),
    }),
    grepManyPatterns: tool({
      inputSchema: toolInputSchemas.grepManyPatterns,
      execute: async (input) => executeLocalTool("grepManyPatterns", input, params.mode),
    }),
    writeFile: tool({
      inputSchema: toolInputSchemas.writeFile,
      execute: async (input) => executeLocalTool("writeFile", input, params.mode),
    }),
    ...(useHeavyTools ? {
      writeManyFiles: tool({
      inputSchema: toolInputSchemas.writeManyFiles,
      execute: async (input) => executeLocalTool("writeManyFiles", input, params.mode),
      }),
    } : {}),
    editFile: tool({
      inputSchema: toolInputSchemas.editFile,
      execute: async (input) => executeLocalTool("editFile", input, params.mode),
    }),
    patchFile: tool({
      inputSchema: toolInputSchemas.patchFile,
      execute: async (input) => executeLocalTool("patchFile", input, params.mode),
    }),
    bash: tool({
      inputSchema: toolInputSchemas.bash,
      execute: async (input) => executeLocalTool("bash", input, params.mode),
    }),
    ...(useHeavyTools ? {
      invokeAI: tool({
      inputSchema: toolInputSchemas.invokeAI,
      execute: async (input) => {
        const subtask = await generateText({
          model,
          system: "You are a focused sub-agent for R'a Core Ultra Mode. Solve the subtask concisely.",
          messages: [
            ...coreMessages,
            {
              role: "user",
              content: [`Subtask: ${input.task}`, input.context ? `Context: ${input.context}` : ""].filter(Boolean).join("\n"),
            },
          ],
          maxSteps: 2,
          maxRetries: 0,
        });

        return { text: subtask.text };
      },
      }),
    } : {}),
    } : undefined;

    try {
      streamingMessage.metadata = {
        ...streamingMessage.metadata,
        model: modelId,
      };

      const result = await streamModelText({
        model,
        system: buildSystemPrompt(params.mode, useModelTools, accelerationContext),
        messages: coreMessages,
        maxSteps,
        tools,
        supportsStreaming: capabilities.supportsStreaming,
        supportsReasoning: capabilities.supportsReasoning,
        startTime,
        streamingMessage,
        onUpdate: params.onUpdate,
      });

      streamedText = result.streamedText;
      reasoningText = result.reasoningText;
      steps = result.steps;
      break;
    } catch (error) {
      if (useModelTools && shouldRetryWithoutTools(error)) {
        try {
          const retry = await streamModelText({
            model,
            system: buildSystemPrompt(params.mode, false, accelerationContext),
            messages: coreMessages,
            maxSteps: 1,
            supportsStreaming: capabilities.supportsStreaming,
            supportsReasoning: capabilities.supportsReasoning,
            startTime,
            streamingMessage,
            onUpdate: params.onUpdate,
          });

          streamedText = retry.streamedText;
          reasoningText = retry.reasoningText;
          steps = retry.steps;
          break;
        } catch (retryError) {
          const formattedRetry = formatChatError(retryError, modelId);
          errors.push(formattedRetry);

          if (!shouldTryOpenRouterFallback(retryError) && !shouldTryNextAutoRoutedModel(retryError, modelId, params.model)) {
            throw formattedRetry;
          }

          continue;
        }
      }

      if (isNoOutputGeneratedError(error)) {
        try {
          const fallback = await generateText({
            model,
            system: buildSystemPrompt(params.mode, useModelTools, accelerationContext),
            messages: coreMessages,
            tools,
            maxSteps,
            maxRetries: 0,
          });

          streamedText = fallback.text;
          if (streamedText) {
            streamingMessage.parts = buildStreamingParts("", streamedText);
            streamingMessage.metadata = {
              ...streamingMessage.metadata,
              durationMs: Date.now() - startTime,
            };
            params.onUpdate?.(streamingMessage);
          }

          steps = fallback.steps as StepResult<ToolSet>[];
          break;
        } catch (fallbackError) {
          const formattedFallback = formatChatError(fallbackError, modelId);
          errors.push(formattedFallback);

          if (!shouldTryOpenRouterFallback(fallbackError) && !shouldTryNextAutoRoutedModel(fallbackError, modelId, params.model)) {
            throw formattedFallback;
          }

          continue;
        }
      }

      const formatted = formatChatError(error, modelId);
      errors.push(formatted);

      if (!shouldTryOpenRouterFallback(error) && !shouldTryNextAutoRoutedModel(error, modelId, params.model)) {
        throw formatted;
      }
    }
  }

  if (!steps) {
    throw new Error(
      [
        "All OpenRouter fallback models failed.",
        ...errors.map((error, index) => `${index + 1}. ${error.message}`),
      ].join("\n"),
    );
  }

  const assistantParts: ChatMessage["parts"] = [];

  for (const [stepIndex, step] of steps.entries()) {
    if (usedSupportsReasoning && typeof step.reasoning === "string" && step.reasoning.length > 0) {
      assistantParts.push({ type: "reasoning", text: step.reasoning });
    }

    for (const toolCall of step.toolCalls ?? []) {
      const toolResult = step.toolResults?.find((resultItem) => resultItem.toolCallId === toolCall.toolCallId);
      assistantParts.push({
        type: `tool-${toolCall.toolName}`,
        toolCallId: toolCall.toolCallId ?? `tool-${stepIndex}-${toolCall.toolName}`,
        input: typeof toolCall.input === "object" && toolCall.input ? toolCall.input as Record<string, unknown> : undefined,
        output: toolResult?.output,
        state: toolResult?.isError ? "output-error" : "output-available",
        errorText: toolResult?.isError ? String(toolResult.output) : undefined,
      });
    }

    if (step.text) {
      assistantParts.push({ type: "text", text: step.text });
    }
  }

  if (assistantParts.length === 0 && streamedText) {
    assistantParts.push({ type: "text", text: streamedText });
  }

  const metadata: MessageMetadata = {
    mode: params.mode,
    provider: ProviderId.OPENROUTER,
    model: usedModelId,
    durationMs: Date.now() - startTime,
  };

  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: assistantParts.length > 0 ? assistantParts : [{ type: "text", text: "No response." }],
    metadata,
  };

  return assistantMessage;
}
