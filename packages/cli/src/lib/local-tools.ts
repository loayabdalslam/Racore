import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "path";
import {
  formatAgentAccelerationContext,
  getAffectedTestsForPaths,
  getAgentAccelerationContext,
  getRelevantProjectMemory,
  getRepoIndex,
  rememberProjectFact,
  searchRepoSymbols,
} from "./agent-accelerator";
import { toolInputSchemas, Mode, type ModeType } from "./app-schema";
import { computeDiff } from "./diff-utils";
import { addActivity, updateActivity } from "./file-activity-store";

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".cts", ".css", ".csv", ".env", ".go", ".graphql", ".html",
  ".java", ".js", ".json", ".jsx", ".kt", ".md", ".mjs", ".mts",
  ".php", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".svelte",
  ".swift", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);

const MAX_FILE_SIZE = 10_000;
const MAX_RESULTS = 200;
const MAX_MATCHES = 50;
const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 30_000;

function resolveInsideCwd(path: string) {
  const cwd = process.cwd();
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the project directory");
  }

  return { cwd, resolved };
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

export async function executeLocalTool(toolName: string, input: unknown, mode: ModeType) {
  if (
    mode === Mode.PLAN
    && ![
      "readFile",
      "listDirectory",
      "glob",
      "grep",
      "readManyFiles",
      "grepManyPatterns",
      "agentPlan",
      "repoIndex",
      "searchSymbols",
      "affectedTests",
      "readProjectMemory",
    ].includes(toolName)
  ) {
    throw new Error(`Tool ${toolName} is not available in PLAN mode`);
  }

  switch (toolName) {
    case "readFile": {
      const { path } = toolInputSchemas.readFile.parse(input);
      const ext = extname(path).toLowerCase();
      if (ext && !TEXT_EXTENSIONS.has(ext)) {
        throw new Error(`Cannot read binary file: "${path}". Only text files are supported.`);
      }
      const { resolved } = resolveInsideCwd(path);
      const content = await readFile(resolved, "utf-8");
      return content.length > MAX_FILE_SIZE
        ? { content: content.slice(0, MAX_FILE_SIZE), truncated: true, totalLength: content.length }
        : { content };
    }
    case "listDirectory": {
      const { path } = toolInputSchemas.listDirectory.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const entries = await readdir(resolved);
      const results: { name: string; type: "file" | "directory" }[] = [];

      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const info = await stat(join(resolved, entry));
        results.push({ name: entry, type: info.isDirectory() ? "directory" : "file" });
      }

      results.sort((a, b) =>
        a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name),
      );
      return { path: relative(cwd, resolved) || ".", entries: results };
    }
    case "glob": {
      const { pattern, path } = toolInputSchemas.glob.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];
      let truncated = false;

      for await (const match of glob.scan({ cwd: resolved, dot: false, onlyFiles: true })) {
        if (match.includes("node_modules")) continue;
        if (files.length >= MAX_RESULTS) {
          truncated = true;
          break;
        }
        files.push(relative(cwd, resolve(resolved, match)));
      }

      files.sort();
      return { files, ...(truncated ? { truncated: true } : {}) };
    }
    case "grep": {
      const { pattern, path, include } = toolInputSchemas.grep.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const args = [
        "-rn",
        "--color=never",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "-E",
      ];
      if (include) args.push(`--include=${include}`);
      args.push(pattern, resolved);

      const proc = Bun.spawn(["grep", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

      if (exitCode !== 0 && exitCode !== 1) throw new Error(`grep failed: ${stderr.trim()}`);
      if (!stdout.trim()) return { matches: [], message: "No matches found" };

      const lines = stdout.trim().split("\n");
      const matches: { file: string; line: number; content: string }[] = [];
      let truncated = false;

      for (const line of lines) {
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          break;
        }
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          matches.push({
            file: relative(cwd, match[1]!),
            line: Number(match[2]),
            content: match[3]!,
          });
        }
      }

      return { matches, ...(truncated ? { truncated: true, totalMatches: lines.length } : {}) };
    }
    case "readManyFiles": {
      const { paths } = toolInputSchemas.readManyFiles.parse(input);
      const results = await Promise.all(
        paths.map(async (path) => {
          const output = await executeLocalTool("readFile", { path }, mode) as { content?: string; truncated?: boolean };
          return { path, ...output };
        }),
      );
      return { files: results };
    }
    case "grepManyPatterns": {
      const { queries } = toolInputSchemas.grepManyPatterns.parse(input);
      const results = await Promise.all(
        queries.map(async (query) => {
          const output = await executeLocalTool("grep", query, mode);
          return { query, result: output };
        }),
      );
      return { results };
    }
    case "agentPlan": {
      const { task, refreshIndex } = toolInputSchemas.agentPlan.parse(input);
      const context = await getAgentAccelerationContext({ task, mode, refreshIndex });
      return {
        ...context,
        promptContext: formatAgentAccelerationContext(context),
      };
    }
    case "repoIndex": {
      const { refresh } = toolInputSchemas.repoIndex.parse(input);
      const index = await getRepoIndex({ refresh });
      return {
        generatedAt: index.generatedAt,
        projectRoot: index.projectRoot,
        stats: index.stats,
        sampleFiles: index.files.slice(0, 30).map((file) => ({
          path: file.path,
          kind: file.kind,
          symbols: file.symbols.slice(0, 6),
        })),
      };
    }
    case "searchSymbols": {
      const { query, limit, refresh } = toolInputSchemas.searchSymbols.parse(input);
      return {
        matches: await searchRepoSymbols(query, { limit, refresh }),
      };
    }
    case "affectedTests": {
      const { paths = [], task, refresh } = toolInputSchemas.affectedTests.parse(input);
      return await getAffectedTestsForPaths(paths, { task, refresh });
    }
    case "readProjectMemory": {
      const { query } = toolInputSchemas.readProjectMemory.parse(input);
      return { facts: getRelevantProjectMemory(query) };
    }
    case "rememberProjectFact": {
      const { fact } = toolInputSchemas.rememberProjectFact.parse(input);
      return { fact: await rememberProjectFact(fact) };
    }
    case "writeFile": {
      const { path, content } = toolInputSchemas.writeFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const relPath = relative(cwd, resolved);
      const actId = addActivity(relPath, "write");
      updateActivity(actId, { status: "in_progress" });
      try {
        const oldContent = await tryReadFile(resolved);
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content, "utf-8");
        const diff = computeDiff(oldContent ?? "", content);
        updateActivity(actId, { status: "completed", diff, content });
        return {
          success: true as const,
          path: relPath,
          bytesWritten: Buffer.byteLength(content, "utf-8"),
          diff,
        };
      } catch (error) {
        updateActivity(actId, { status: "error", error: String(error) });
        throw error;
      }
    }
    case "writeManyFiles": {
      const { files } = toolInputSchemas.writeManyFiles.parse(input);
      const results = await Promise.all(
        files.map(async (file) => executeLocalTool("writeFile", file, mode)),
      );
      return { files: results };
    }
    case "editFile": {
      const { path, oldString, newString } = toolInputSchemas.editFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const relPath = relative(cwd, resolved);
      const actId = addActivity(relPath, "edit");
      updateActivity(actId, { status: "in_progress" });
      try {
        const content = await readFile(resolved, "utf-8");
        const occurrences = content.split(oldString).length - 1;

        if (occurrences === 0) {
          updateActivity(actId, { status: "error", error: "oldString not found" });
          throw new Error("oldString not found in file");
        }
        if (occurrences > 1) {
          updateActivity(actId, { status: "error", error: "ambiguous match" });
          throw new Error(`oldString is ambiguous; found ${occurrences} matches`);
        }

        const newContent = content.replace(oldString, newString);
        await writeFile(resolved, newContent, "utf-8");
        const diff = computeDiff(content, newContent);
        updateActivity(actId, { status: "completed", diff, content: newContent });
        return { success: true as const, path: relPath, diff };
      } catch (error) {
        if (!(error instanceof Error && (error.message.includes("oldString") || error.message.includes("ambiguous")))) {
          updateActivity(actId, { status: "error", error: String(error) });
        }
        throw error;
      }
    }
    case "patchFile": {
      const { path, patches } = toolInputSchemas.patchFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const relPath = relative(cwd, resolved);
      const actId = addActivity(relPath, "patch");
      updateActivity(actId, { status: "in_progress" });
      try {
        const originalContent = await readFile(resolved, "utf-8");
        let content = originalContent;

      for (const patch of patches) {
        if (patch.action === "append") {
          content = content.endsWith("\n")
            ? `${content}${patch.content}`
            : `${content}\n${patch.content}`;
          continue;
        }

        if (!patch.anchor) {
          throw new Error(`Patch action ${patch.action} requires an anchor`);
        }

        const occurrences = content.split(patch.anchor).length - 1;
        if (occurrences === 0) throw new Error("Patch anchor not found in file");
        if (occurrences > 1) throw new Error(`Patch anchor is ambiguous; found ${occurrences} matches`);

        if (patch.action === "replace") {
          content = content.replace(patch.anchor, patch.content);
        } else if (patch.action === "insertBefore") {
          content = content.replace(patch.anchor, `${patch.content}${patch.anchor}`);
        } else {
          content = content.replace(patch.anchor, `${patch.anchor}${patch.content}`);
        }
      }

      await writeFile(resolved, content, "utf-8");
      const diff = computeDiff(originalContent, content);
      updateActivity(actId, { status: "completed", diff, content });
      return {
        success: true as const,
        path: relPath,
        patchesApplied: patches.length,
        diff,
      };
      } catch (error) {
        updateActivity(actId, { status: "error", error: String(error) });
        throw error;
      }
    }
    case "bash": {
      const { command, timeout = DEFAULT_TIMEOUT } = toolInputSchemas.bash.parse(input);
      const proc = Bun.spawn(["bash", "-c", command], {
        cwd: resolveInsideCwd(".").resolved,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, TERM: "dumb" },
      });
      const timer = setTimeout(() => proc.kill(), timeout);
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      clearTimeout(timer);
      return {
        stdout: truncate(stdout, MAX_OUTPUT),
        stderr: truncate(stderr, MAX_OUTPUT),
        exitCode,
      };
    }
    case "updateTodoList": {
      const { updates } = toolInputSchemas.updateTodoList.parse(input);
      const { addTodo, updateTodoStatus, getTodos } = await import("./todo-store");
      const results: Array<{ id: string; title: string; status: string }> = [];
      for (const update of updates) {
        if (update.id) {
          updateTodoStatus(update.id, update.status);
          results.push({ id: update.id, title: update.title, status: update.status });
        } else {
          const item = addTodo(update.title);
          if (update.status !== "pending") updateTodoStatus(item.id, update.status);
          results.push({ id: item.id, title: item.title, status: item.status });
        }
      }
      return { todos: results };
    }
    case "getTodoList": {
      toolInputSchemas.getTodoList.parse(input);
      const { getTodos } = await import("./todo-store");
      return { todos: getTodos().map((t) => ({ id: t.id, title: t.title, status: t.status })) };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
