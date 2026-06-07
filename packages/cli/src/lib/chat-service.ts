import { APICallError, generateText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
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
import { getProviderModels } from "./models";
import { getProviderAuth } from "./provider-auth";

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

  const openrouter = createOpenAI({
    apiKey: auth.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://github.com/loayabdalslam/racore",
      "X-Title": "R'a Core",
    },
  });
  return openrouter(modelId);
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

function toCoreMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
  }));
}

export async function submitChat(params: {
  messages: ChatMessage[];
  mode: ModeType;
  model: string;
}) {
  const startTime = Date.now();
  const coreMessages = toCoreMessages(params.messages);
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

  const modelIds = getOpenRouterCandidateModels(params.model);

  let usedModelId = params.model;
  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  const errors: Error[] = [];

  for (const modelId of modelIds) {
    usedModelId = modelId;
    const model = getModel(modelId);

    const tools = useTools ? {
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
      result = await generateText({
        model,
        system: buildSystemPrompt(params.mode, useTools, accelerationContext),
        messages: coreMessages,
        tools,
        maxSteps,
        maxRetries: 0,
      });
      break;
    } catch (error) {
      const formatted = formatChatError(error, modelId);
      errors.push(formatted);

      if (!shouldTryOpenRouterFallback(error)) {
        throw formatted;
      }
    }
  }

  if (!result) {
    throw new Error(
      [
        "All OpenRouter fallback models failed.",
        ...errors.map((error, index) => `${index + 1}. ${error.message}`),
      ].join("\n"),
    );
  }

  const assistantParts: ChatMessage["parts"] = [];

  for (const [stepIndex, step] of result.steps.entries()) {
    if (typeof step.reasoning === "string" && step.reasoning.length > 0) {
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

  if (assistantParts.length === 0 && result.text) {
    assistantParts.push({ type: "text", text: result.text });
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
