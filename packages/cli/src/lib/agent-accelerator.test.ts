import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  classifyAgentTask,
  formatAgentAccelerationContext,
  getAffectedTestsForPaths,
  getAgentAccelerationContext,
  getRepoIndex,
  searchRepoSymbols,
  LRUMap,
  MAX_CACHED_PROJECTS,
} from "./agent-accelerator";

const originalCwd = process.cwd();
let workspace = "";

function writeWorkspaceFile(path: string, content: string) {
  const absolutePath = join(workspace, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

describe("agent accelerator", () => {
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "racore-agent-"));
    process.chdir(workspace);
    writeWorkspaceFile(
      "package.json",
      JSON.stringify({
        scripts: {
          build: "bun build src/index.ts",
          test: "bun test src/lib/*.test.ts",
        },
      }),
    );
    writeWorkspaceFile(
      "src/lib/chat-service.ts",
      [
        "import { executeLocalTool } from './local-tools';",
        "export async function submitChat() {",
        "  return executeLocalTool;",
        "}",
      ].join("\n"),
    );
    writeWorkspaceFile(
      "src/lib/chat-service.test.ts",
      [
        "import { submitChat } from './chat-service';",
        "test('submitChat exists', () => {",
        "  expect(submitChat).toBeTruthy();",
        "});",
      ].join("\n"),
    );
    writeWorkspaceFile(
      "src/components/input-bar.tsx",
      "export function InputBar() { return null; }\n",
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(workspace)) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("classifies coding tasks and adds fallback search terms", () => {
    const task = classifyAgentTask("implement faster chat tool planning");

    expect(task.kind).toBe("feature");
    expect(task.searchTerms).toContain("chat");
    expect(task.searchTerms).toContain("tool");
  });

  it("builds a cached repo index with symbols", async () => {
    const index = await getRepoIndex({ refresh: true });

    expect(index.stats.indexedFileCount).toBeGreaterThanOrEqual(4);
    expect(index.files.find((file) => file.path === "src/lib/chat-service.ts")?.symbols).toContain("submitChat");
  });

  it("selects likely files and affected tests from the task", async () => {
    const context = await getAgentAccelerationContext({
      task: "fix chat service submitChat streaming bug",
      refreshIndex: true,
    });

    expect(context.candidateFiles[0]?.path).toBe("src/lib/chat-service.ts");
    expect(context.affectedTests.some((test) => test.path === "src/lib/chat-service.test.ts")).toBe(true);
    expect(formatAgentAccelerationContext(context)).toContain("Fast workspace context");
  });

  it("searches symbols through the index", async () => {
    const matches = await searchRepoSymbols("submitChat", { refresh: true });

    expect(matches[0]).toMatchObject({
      path: "src/lib/chat-service.ts",
      symbol: "submitChat",
    });
  });

  it("suggests focused tests for changed paths", async () => {
    const result = await getAffectedTestsForPaths(["src/lib/chat-service.ts"], {
      task: "fix chat service",
      refresh: true,
    });

    expect(result.tests.map((test) => test.path)).toContain("src/lib/chat-service.test.ts");
    expect(result.verificationCommands).toContain("npm test");
  });

  describe("LRUMap", () => {
    it("returns undefined for missing keys", () => {
      const cache = new LRUMap<string, number>(3);
      expect(cache.get("a")).toBeUndefined();
    });

    it("stores and retrieves values", () => {
      const cache = new LRUMap<string, number>(3);
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
    });

    it("evicts the least recently used item when over capacity", () => {
      const cache = new LRUMap<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.set("d", 4);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("promotes accessed items to most-recently-used", () => {
      const cache = new LRUMap<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.get("a");
      cache.set("d", 4);
      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
    });

    it("updates existing keys without affecting capacity", () => {
      const cache = new LRUMap<string, number>(2);
      cache.set("a", 1);
      cache.set("a", 99);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("exposes MAX_CACHED_PROJECTS as a positive integer", () => {
      expect(MAX_CACHED_PROJECTS).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_CACHED_PROJECTS)).toBe(true);
    });
  });
});
