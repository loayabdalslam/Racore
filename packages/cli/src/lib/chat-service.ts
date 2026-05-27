import { generateText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  Mode,
  ProviderId,
  toolInputSchemas,
  type ChatMessage,
  type MessageMetadata,
  type ModeType,
  type ProviderIdType,
} from "./app-schema";
import { executeLocalTool } from "./local-tools";
import { getProviderAuth } from "./provider-auth";

function buildSystemPrompt(mode: ModeType) {
  if (mode === Mode.PLAN) {
    return "You are R'a Core, a planning-first coding assistant. In PLAN mode, inspect and reason carefully. Only use read-only tools.";
  }

  if (mode === Mode.ULTRA) {
    return [
      "You are R'a Core in Ultra Mode.",
      "Ultra Mode is optimized for parallel execution, parallel tool calling, and delegated sub-analysis.",
      "When useful, issue multiple independent tool calls in the same step.",
      "Prefer batch tools such as readManyFiles, grepManyPatterns, and writeManyFiles when the task spans several files.",
      "Use invokeAI for focused sub-analysis or decomposition when parallel reasoning would help.",
      "Keep work coordinated and merge results back into one clear response.",
    ].join(" ");
  }

  return "You are R'a Core, a coding assistant working inside the user's local project. Use tools when needed, prefer precise edits, and explain progress clearly.";
}

function getModel(provider: ProviderIdType, modelId: string) {
  const auth = getProviderAuth(provider);
  if (!auth.apiKey) {
    throw new Error(`Provider ${provider} is not connected`);
  }

  if (provider === ProviderId.OPENROUTER) {
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

  if (provider === ProviderId.GROQ) {
    const groq = createOpenAI({
      apiKey: auth.apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    return groq(modelId);
  }

  if (provider === ProviderId.XAI) {
    const xai = createOpenAI({
      apiKey: auth.apiKey,
      baseURL: "https://api.x.ai/v1",
    });
    return xai(modelId);
  }

  if (provider === ProviderId.DEEPSEEK) {
    const deepseek = createOpenAI({
      apiKey: auth.apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    return deepseek(modelId);
  }

  const openai = createOpenAI({
    apiKey: auth.apiKey,
  });
  return openai(modelId);
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
  provider: ProviderIdType;
  model: string;
}) {
  const startTime = Date.now();
  const model = getModel(params.provider, params.model);
  const coreMessages = toCoreMessages(params.messages);

  const tools = {
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
    writeManyFiles: tool({
      inputSchema: toolInputSchemas.writeManyFiles,
      execute: async (input) => executeLocalTool("writeManyFiles", input, params.mode),
    }),
    editFile: tool({
      inputSchema: toolInputSchemas.editFile,
      execute: async (input) => executeLocalTool("editFile", input, params.mode),
    }),
    bash: tool({
      inputSchema: toolInputSchemas.bash,
      execute: async (input) => executeLocalTool("bash", input, params.mode),
    }),
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
        });

        return { text: subtask.text };
      },
    }),
  };

  const result = await generateText({
    model,
    system: buildSystemPrompt(params.mode),
    messages: coreMessages,
    tools,
    maxSteps: params.mode === Mode.PLAN ? 6 : params.mode === Mode.ULTRA ? 14 : 10,
  });

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
    provider: params.provider,
    model: params.model,
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
