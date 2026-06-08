import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getProviderAuth } from "./provider-auth";
import { ProviderId, Mode, type ModeType } from "./app-schema";
import { addTodo, updateTodoStatus, getPendingTodos, getInProgressTodos, getTodoStats, completeTodoWithResult, setTodoError, batchUpdate } from "./todo-store";

const MAX_CONCURRENT = 3;
const RATE_LIMIT_DELAY_MS = 300;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 2;

type ExecutorOptions = {
  model?: string;
  mode?: ModeType;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
  taskIds?: string[];
};

const EXECUTION_PROMPT = (task: string) =>
  `You are a focused task executor. Complete the following task precisely and concisely.

Task: ${task}

Rules:
- Only do what the task asks, nothing more
- If the task requires reading files, use readFile
- If the task requires creating or editing files, use writeFile or editFile
- If the task requires running commands, use bash
- Keep output brief and focused on the result
- Return a summary of what was done`;

type RateLimiter = {
  lastCall: number;
  callsInWindow: number;
  windowStart: number;
};

const WINDOW_MS = 1_000;
const MAX_CALLS_PER_WINDOW = 5;

const limiter: RateLimiter = { lastCall: 0, callsInWindow: 0, windowStart: Date.now() };

async function acquireSlot(): Promise<void> {
  const now = Date.now();
  if (now - limiter.windowStart > WINDOW_MS) {
    limiter.callsInWindow = 0;
    limiter.windowStart = now;
  }

  if (limiter.callsInWindow >= MAX_CALLS_PER_WINDOW) {
    const wait = WINDOW_MS - (now - limiter.windowStart);
    await sleep(wait + 50);
    limiter.callsInWindow = 0;
    limiter.windowStart = Date.now();
  }

  const elapsed = now - limiter.lastCall;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - elapsed);
  }

  limiter.lastCall = Date.now();
  limiter.callsInWindow++;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSingleTask(todoId: string, options: ExecutorOptions): Promise<void> {
  const todos = getPendingTodos().concat(getInProgressTodos());
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) return;

  updateTodoStatus(todoId, "in_progress");

  const auth = getProviderAuth(ProviderId.OPENROUTER);
  if (!auth.apiKey) {
    setTodoError(todoId, "No API key");
    return;
  }

  const openrouter = createOpenRouter({ apiKey: auth.apiKey });
  const model = openrouter.chat(options.model ?? "openai/gpt-4o-mini");
  const maxSteps = options.mode === Mode.ULTRA ? 6 : options.mode === Mode.PLAN ? 2 : 4;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await acquireSlot();

      const result = await generateText({
        model,
        system: EXECUTION_PROMPT(todo.title),
        messages: [{ role: "user", content: todo.description ?? todo.title }],
        maxSteps,
        maxRetries: 1,
      });

      completeTodoWithResult(todoId, result.text.slice(0, 500));
      options.onProgress?.(
        getTodoStats().completed + getTodoStats().cancelled,
        getTodoStats().total,
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = /429|rate.?limit|too many/i.test(message);
      const isTimeout = /timeout|timed.?out/i.test(message);

      if (isRateLimit && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1) * 2);
        continue;
      }

      if (isTimeout && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      setTodoError(todoId, message.slice(0, 200));
      options.onProgress?.(
        getTodoStats().completed + getTodoStats().cancelled,
        getTodoStats().total,
      );
      return;
    }
  }

  setTodoError(todoId, "Max retries exceeded");
}

export async function executeAllTasks(options: ExecutorOptions = {}): Promise<void> {
  let pending = getPendingTodos();
  if (options.taskIds) {
    pending = pending.filter((t) => options.taskIds!.includes(t.id));
  }
  if (pending.length === 0) return;

  const concurrency = options.concurrency ?? MAX_CONCURRENT;
  const queue = [...pending];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < concurrency && queue.length > 0) {
      const todo = queue.shift()!;
      const promise = executeSingleTask(todo.id, options).finally(() => {
        const idx = running.indexOf(promise);
        if (idx >= 0) running.splice(idx, 1);
      });
      running.push(promise);
    }

    if (running.length > 0) {
      await Promise.race(running);
    }
  }
}

export async function executeTask(todoId: string, options: ExecutorOptions = {}): Promise<void> {
  await executeSingleTask(todoId, options);
}

export function isExecutionInProgress(): boolean {
  return getInProgressTodos().length > 0;
}
