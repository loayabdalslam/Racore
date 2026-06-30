import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { APP_DIR, ensureAppDirectories } from "./app-paths";
import { Mode, type ModeType } from "./app-schema";

const INDEX_VERSION = 1;
const MEMORY_VERSION = 1;
const INDEX_MEMORY_TTL_MS = 5 * 60_000;
const MAX_INDEXED_FILES = 4_000;
const MAX_ANALYZED_FILE_BYTES = 220_000;
const MAX_SYMBOLS_PER_FILE = 50;
const MAX_IMPORTS_PER_FILE = 40;
const MAX_CONTEXT_CHARS = 1_800;

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".scss",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const IMPORTANT_FILENAMES = new Set([
  "agents.md",
  "claude.md",
  "package.json",
  "readme.md",
  "tsconfig.json",
  "vite.config.ts",
]);

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const IGNORED_FILENAMES = new Set([
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "agent",
  "another",
  "before",
  "build",
  "change",
  "code",
  "file",
  "fix",
  "from",
  "have",
  "into",
  "make",
  "need",
  "please",
  "project",
  "should",
  "that",
  "this",
  "update",
  "with",
]);

export type AgentTaskKind =
  | "bug"
  | "config"
  | "docs"
  | "feature"
  | "refactor"
  | "test"
  | "ui"
  | "unknown";

export type AgentRiskLevel = "low" | "medium" | "high";

export type AgentTaskClassification = {
  kind: AgentTaskKind;
  risk: AgentRiskLevel;
  needsWrite: boolean;
  needsVerification: boolean;
  searchTerms: string[];
};

export type RepoFileSummary = {
  path: string;
  size: number;
  mtimeMs: number;
  extension: string;
  kind: string;
  imports: string[];
  exports: string[];
  symbols: string[];
  headings: string[];
  isTest: boolean;
};

export type RepoIndex = {
  version: number;
  projectRoot: string;
  projectHash: string;
  generatedAt: string;
  fingerprint: string;
  files: RepoFileSummary[];
  stats: {
    fileCount: number;
    indexedFileCount: number;
    testCount: number;
    totalBytes: number;
    languages: Record<string, number>;
  };
};

export type CandidateFile = {
  path: string;
  score: number;
  reason: string;
  symbols: string[];
};

export type ProjectMemoryFact = {
  id: string;
  text: string;
  createdAt: string;
};

export type ProjectMemory = {
  version: number;
  projectRoot: string;
  facts: ProjectMemoryFact[];
};

export type AgentAccelerationContext = {
  task: AgentTaskClassification;
  index: RepoIndex["stats"] & {
    generatedAt: string;
    projectRoot: string;
  };
  candidateFiles: CandidateFile[];
  affectedTests: CandidateFile[];
  verificationCommands: string[];
  modelRouting: string[];
  strategy: string[];
  memory: ProjectMemoryFact[];
};

type FileMeta = {
  absolutePath: string;
  path: string;
  size: number;
  mtimeMs: number;
};

const MAX_CACHED_PROJECTS = 5;

class LRUMap<K, V> {
  private max: number;
  private map: Map<K, V>;

  constructor(max: number) {
    this.max = max;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) {
        this.map.delete(oldest.value);
      }
    }
    this.map.set(key, value);
  }
}

const inMemoryIndexes = new LRUMap<string, RepoIndex>(MAX_CACHED_PROJECTS);

export { LRUMap, MAX_CACHED_PROJECTS };

function normalizePath(path: string) {
  return path.split(sep).join("/");
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getProjectRoot() {
  return resolve(process.cwd());
}

function getProjectHash(projectRoot = getProjectRoot()) {
  return hashText(projectRoot.toLowerCase());
}

function getCacheDir() {
  ensureAppDirectories();
  const cacheDir = join(APP_DIR, "cache");
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  return cacheDir;
}

function getIndexCachePath(projectRoot = getProjectRoot()) {
  return join(getCacheDir(), `${getProjectHash(projectRoot)}.index.json`);
}

function getMemoryCachePath(projectRoot = getProjectRoot()) {
  return join(getCacheDir(), `${getProjectHash(projectRoot)}.memory.json`);
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function isProbablyTextFile(relativePath: string) {
  const lower = relativePath.toLowerCase();
  return TEXT_EXTENSIONS.has(extname(lower)) || IMPORTANT_FILENAMES.has(basename(lower));
}

function shouldSkipPath(relativePath: string) {
  const parts = normalizePath(relativePath).split("/");
  const lowerName = parts[parts.length - 1]?.toLowerCase() ?? "";
  return (
    IGNORED_FILENAMES.has(lowerName)
    || parts.some((part) => IGNORED_DIRS.has(part))
    || lowerName.endsWith(".map")
    || lowerName.endsWith(".log")
  );
}

function detectKind(relativePath: string) {
  const lower = relativePath.toLowerCase();
  const extension = extname(lower);

  if (/\.(test|spec)\.[tj]sx?$/.test(lower)) return "test";
  if (lower.includes("/screens/")) return "screen";
  if (lower.includes("/components/")) return "component";
  if (lower.includes("/providers/")) return "provider";
  if (lower.includes("/hooks/")) return "hook";
  if (lower.includes("/lib/")) return "library";
  if (extension === ".md") return "docs";
  if (extension === ".json" || lower.includes("config")) return "config";
  if (extension === ".css" || extension === ".scss") return "style";
  return extension.replace(".", "") || "file";
}

function isTestPath(relativePath: string) {
  return /\.(test|spec)\.[tj]sx?$/.test(relativePath.toLowerCase())
    || relativePath.toLowerCase().includes("/__tests__/");
}

function extractImports(content: string) {
  const imports: string[] = [];
  const importRegex =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of content.matchAll(importRegex)) {
    imports.push(match[1] ?? match[2] ?? "");
  }

  return uniqueLimited(imports, MAX_IMPORTS_PER_FILE);
}

function extractSymbols(content: string) {
  const symbols: string[] = [];
  const symbolRegex =
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)|\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;

  for (const match of content.matchAll(symbolRegex)) {
    symbols.push(match[1] ?? match[2] ?? "");
  }

  return uniqueLimited(symbols, MAX_SYMBOLS_PER_FILE);
}

function extractExports(content: string) {
  const exports: string[] = [];
  const namedExportRegex =
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const groupedExportRegex = /\bexport\s*\{([^}]+)\}/g;

  for (const match of content.matchAll(namedExportRegex)) {
    exports.push(match[1] ?? "");
  }

  for (const match of content.matchAll(groupedExportRegex)) {
    const names = (match[1] ?? "")
      .split(",")
      .map((item) => item.trim().split(/\s+as\s+/i)[0]?.trim() ?? "");
    exports.push(...names);
  }

  return uniqueLimited(exports, MAX_SYMBOLS_PER_FILE);
}

function extractHeadings(content: string) {
  const headings: string[] = [];
  const headingRegex = /^#{1,4}\s+(.+)$/gm;

  for (const match of content.matchAll(headingRegex)) {
    headings.push(match[1]?.trim() ?? "");
  }

  return uniqueLimited(headings, 20);
}

async function collectFileMeta(projectRoot: string) {
  const results: FileMeta[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const directoryTasks: Promise<void>[] = [];

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = normalizePath(relative(projectRoot, absolutePath));

      if (shouldSkipPath(relativePath)) continue;

      if (entry.isDirectory()) {
        directoryTasks.push(walk(absolutePath));
        continue;
      }

      if (!entry.isFile() || !isProbablyTextFile(relativePath)) continue;

      const info = await stat(absolutePath).catch(() => null);
      if (!info || !info.isFile()) continue;

      results.push({
        absolutePath,
        path: relativePath,
        size: info.size,
        mtimeMs: Math.round(info.mtimeMs),
      });

      if (results.length >= MAX_INDEXED_FILES) break;
    }

    await Promise.all(directoryTasks);
  }

  await walk(projectRoot);

  return results
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, MAX_INDEXED_FILES);
}

function buildFingerprint(files: FileMeta[]) {
  return hashText(files.map((file) => `${file.path}:${file.size}:${file.mtimeMs}`).join("\n"));
}

async function summarizeFile(file: FileMeta): Promise<RepoFileSummary> {
  const extension = extname(file.path).toLowerCase();
  const summary: RepoFileSummary = {
    path: file.path,
    size: file.size,
    mtimeMs: file.mtimeMs,
    extension,
    kind: detectKind(file.path),
    imports: [],
    exports: [],
    symbols: [],
    headings: [],
    isTest: isTestPath(file.path),
  };

  if (file.size > MAX_ANALYZED_FILE_BYTES) return summary;

  const content = await readFile(file.absolutePath, "utf8").catch(() => "");
  summary.imports = extractImports(content);
  summary.exports = extractExports(content);
  summary.symbols = extractSymbols(content);
  summary.headings = extractHeadings(content);
  return summary;
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
) {
  const results: U[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const current = values[cursor];
      cursor += 1;
      if (current !== undefined) {
        results.push(await mapper(current));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  return results;
}

function readCachedIndex(path: string) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RepoIndex;
    return parsed.version === INDEX_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedIndex(path: string, index: RepoIndex) {
  writeFileSync(path, JSON.stringify(index, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getRepoIndex(options: { refresh?: boolean } = {}) {
  const projectRoot = getProjectRoot();
  const cachedInMemory = inMemoryIndexes.get(projectRoot);
  const generatedAt = cachedInMemory ? Date.parse(cachedInMemory.generatedAt) : 0;

  if (
    cachedInMemory
    && !options.refresh
    && Number.isFinite(generatedAt)
    && Date.now() - generatedAt < INDEX_MEMORY_TTL_MS
  ) {
    return cachedInMemory;
  }

  const fileMeta = await collectFileMeta(projectRoot);
  const fingerprint = buildFingerprint(fileMeta);
  const cachePath = getIndexCachePath(projectRoot);
  const cachedOnDisk = !options.refresh && existsSync(cachePath)
    ? readCachedIndex(cachePath)
    : null;

  if (cachedOnDisk?.fingerprint === fingerprint) {
    inMemoryIndexes.set(projectRoot, cachedOnDisk);
    return cachedOnDisk;
  }

  const files = await mapWithConcurrency(fileMeta, 24, summarizeFile);
  const languages: Record<string, number> = {};

  for (const file of files) {
    const key = file.extension || file.kind;
    languages[key] = (languages[key] ?? 0) + 1;
  }

  const index: RepoIndex = {
    version: INDEX_VERSION,
    projectRoot,
    projectHash: getProjectHash(projectRoot),
    generatedAt: new Date().toISOString(),
    fingerprint,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    stats: {
      fileCount: fileMeta.length,
      indexedFileCount: files.length,
      testCount: files.filter((file) => file.isTest).length,
      totalBytes: fileMeta.reduce((total, file) => total + file.size, 0),
      languages,
    },
  };

  writeCachedIndex(cachePath, index);
  inMemoryIndexes.set(projectRoot, index);
  return index;
}

function extractTerms(text: string) {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const splitWords = words.flatMap((word) => word.split(/[-_]/));

  return uniqueLimited(
    splitWords.filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    18,
  );
}

function addTaskFallbackTerms(kind: AgentTaskKind, terms: string[]) {
  const next = new Set(terms);

  const fallbackByKind: Record<AgentTaskKind, string[]> = {
    bug: ["error", "fix", "test", "service"],
    config: ["config", "provider", "auth", "model", "settings"],
    docs: ["readme", "docs", "agents"],
    feature: ["chat", "tool", "agent", "service", "schema", "session"],
    refactor: ["service", "lib", "types", "schema"],
    test: ["test", "spec"],
    ui: ["component", "screen", "dialog", "input"],
    unknown: ["readme", "package", "src"],
  };

  for (const term of fallbackByKind[kind]) {
    next.add(term);
  }

  return [...next].slice(0, 24);
}

export function classifyAgentTask(text: string): AgentTaskClassification {
  const normalized = text.toLowerCase();
  const terms = extractTerms(text);
  let kind: AgentTaskKind = "unknown";

  if (/\b(error|bug|crash|exception|fail|failing|regression|broken)\b/.test(normalized)) {
    kind = "bug";
  } else if (/\b(test|spec|coverage|assert|failing test)\b/.test(normalized)) {
    kind = "test";
  } else if (/\b(ui|ux|screen|component|dialog|layout|style|theme|frontend)\b/.test(normalized)) {
    kind = "ui";
  } else if (/\b(config|provider|auth|api key|model|settings|env)\b/.test(normalized)) {
    kind = "config";
  } else if (/\b(readme|docs|documentation|copy|text)\b/.test(normalized)) {
    kind = "docs";
  } else if (/\b(refactor|cleanup|simplify|rename|restructure)\b/.test(normalized)) {
    kind = "refactor";
  } else if (normalized.trim().length > 0) {
    kind = "feature";
  }

  const needsWrite =
    kind !== "unknown"
    && /\b(add|apply|build|change|create|edit|fix|implement|make|refactor|remove|update)\b/.test(
      normalized,
    );
  const highRisk = /\b(auth|billing|credential|database|delete|migration|payment|secret|security)\b/.test(
    normalized,
  );
  const mediumRisk = /\b(all|architecture|config|provider|refactor|settings)\b/.test(normalized);
  const risk: AgentRiskLevel = highRisk ? "high" : mediumRisk ? "medium" : "low";

  return {
    kind,
    risk,
    needsWrite,
    needsVerification: needsWrite || kind === "bug" || kind === "test" || risk !== "low",
    searchTerms: addTaskFallbackTerms(kind, terms),
  };
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function scoreFile(file: RepoFileSummary, task: AgentTaskClassification) {
  const pathText = file.path.toLowerCase();
  const symbolText = [...file.symbols, ...file.exports].join(" ").toLowerCase();
  const importText = file.imports.join(" ").toLowerCase();
  const headingText = file.headings.join(" ").toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const term of task.searchTerms) {
    if (pathText.includes(term)) {
      score += 7;
      reasons.push(`path:${term}`);
    }
    if (symbolText.includes(term)) {
      score += 9;
      reasons.push(`symbol:${term}`);
    }
    if (importText.includes(term)) score += 3;
    if (headingText.includes(term)) score += 4;
  }

  if (task.kind === "ui" && includesAny(pathText, ["component", "screen", "dialog", ".tsx"])) {
    score += 8;
    reasons.push("ui-area");
  }

  if (task.kind === "config" && includesAny(pathText, ["config", "provider", "auth", "model"])) {
    score += 10;
    reasons.push("config-area");
  }

  if (task.kind === "docs" && (file.extension === ".md" || pathText.includes("docs"))) {
    score += 10;
    reasons.push("docs-area");
  }

  if (task.kind === "test" && file.isTest) {
    score += 12;
    reasons.push("test-file");
  }

  if (task.kind === "feature" && includesAny(pathText, ["chat", "tool", "schema", "session", "agent"])) {
    score += 9;
    reasons.push("agent-core");
  }

  if (file.isTest && task.kind !== "test") score -= 3;
  if (pathText.includes("/dist/")) score -= 10;

  return { score, reason: uniqueLimited(reasons, 4).join(", ") || "term match" };
}

function toCandidate(file: RepoFileSummary, score: number, reason: string): CandidateFile {
  return {
    path: file.path,
    score,
    reason,
    symbols: file.symbols.slice(0, 8),
  };
}

function selectCandidateFiles(index: RepoIndex, task: AgentTaskClassification, limit: number) {
  const scored = index.files
    .map((file) => {
      const scoredFile = scoreFile(file, task);
      return { file, ...scoredFile };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path));

  if (scored.length > 0) {
    return scored.slice(0, limit).map((item) => toCandidate(item.file, item.score, item.reason));
  }

  return index.files
    .filter((file) =>
      file.path === "package.json"
      || file.path.toLowerCase().endsWith("agents.md")
      || file.path.toLowerCase().startsWith("src/"),
    )
    .slice(0, limit)
    .map((file) => toCandidate(file, 1, "entrypoint"));
}

function moduleStem(path: string) {
  return basename(path)
    .replace(/\.(test|spec)\.[tj]sx?$/i, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

function sourceImportCandidates(path: string) {
  const withoutExtension = path.replace(/\.[^.]+$/, "");
  return [path, withoutExtension, `./${withoutExtension}`, moduleStem(path)];
}

function selectAffectedTests(index: RepoIndex, candidates: CandidateFile[], task: AgentTaskClassification, limit: number) {
  const sourceCandidates = candidates.filter((candidate) => !isTestPath(candidate.path));
  const scored = index.files
    .filter((file) => file.isTest)
    .map((file) => {
      let score = task.kind === "test" ? 4 : 0;
      const pathText = file.path.toLowerCase();
      const importText = file.imports.join(" ").toLowerCase();
      const reasons: string[] = [];

      for (const candidate of sourceCandidates) {
        const candidateStem = moduleStem(candidate.path);
        const sameStem = moduleStem(file.path) === candidateStem || pathText.includes(candidateStem);
        const importsCandidate = sourceImportCandidates(candidate.path)
          .some((importPath) => importText.includes(importPath.toLowerCase()));

        if (sameStem) {
          score += 10;
          reasons.push(`same-stem:${candidateStem}`);
        }

        if (importsCandidate) {
          score += 8;
          reasons.push(`imports:${candidateStem}`);
        }
      }

      return { file, score, reason: uniqueLimited(reasons, 3).join(", ") || "nearby test" };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path));

  if (scored.length > 0) {
    return scored.slice(0, limit).map((item) => toCandidate(item.file, item.score, item.reason));
  }

  if (task.needsVerification) {
    return index.files
      .filter((file) => file.isTest)
      .slice(0, Math.min(3, limit))
      .map((file) => toCandidate(file, 1, "fallback test"));
  }

  return [];
}

function readPackageScripts(projectRoot: string) {
  try {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return packageJson.scripts ?? {};
  } catch {
    return {};
  }
}

function suggestVerificationCommands(projectRoot: string, task: AgentTaskClassification, affectedTests: CandidateFile[]) {
  const scripts = readPackageScripts(projectRoot);
  const commands: string[] = [];
  const bunRunner = resolve(projectRoot, "../../scripts/run-bun.mjs");

  if (affectedTests.length === 1 && existsSync(bunRunner)) {
    commands.push(`node ../../scripts/run-bun.mjs test ${affectedTests[0]!.path}`);
  }

  if (scripts.test) commands.push("npm test");
  if (task.needsVerification && scripts.build) commands.push("npm run build");

  return uniqueLimited(commands, 4);
}

function buildStrategy(task: AgentTaskClassification, candidates: CandidateFile[]) {
  const strategy = [
    "Use the cached repo index before broad file reads.",
    "Read candidate files in one batch, then patch the smallest surface.",
  ];

  if (candidates.length > 1) {
    strategy.push("Inspect related files in parallel and keep edits scoped to the highest scoring path.");
  }

  if (task.needsVerification) {
    strategy.push("Run affected tests first, then the wider build/test command if risk remains.");
  }

  if (task.risk === "high") {
    strategy.push("Avoid destructive changes and verify security-sensitive behavior explicitly.");
  }

  return strategy;
}

function modelRoutingHints(task: AgentTaskClassification) {
  const hints = ["fast-small: classify, index, summarize, and test selection"];

  if (task.risk === "high" || task.kind === "refactor") {
    hints.push("strong: final patch design and risky cross-file reasoning");
  } else {
    hints.push("balanced: implementation once candidate files are known");
  }

  hints.push("fast-small: final diff review and command triage");
  return hints;
}

function readProjectMemory(projectRoot = getProjectRoot()): ProjectMemory {
  const path = getMemoryCachePath(projectRoot);

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ProjectMemory;
    if (parsed.version === MEMORY_VERSION) return parsed;
  } catch {
    // Empty memory is fine for a new project.
  }

  return {
    version: MEMORY_VERSION,
    projectRoot,
    facts: [],
  };
}

function scoreMemoryFact(fact: ProjectMemoryFact, terms: string[]) {
  const text = fact.text.toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

export async function rememberProjectFact(fact: string) {
  const projectRoot = getProjectRoot();
  const memory = readProjectMemory(projectRoot);
  const trimmed = fact.trim();

  if (!trimmed) throw new Error("Memory fact cannot be empty");

  const nextFacts = [
    {
      id: hashText(`${Date.now()}:${trimmed}`),
      text: trimmed.slice(0, 500),
      createdAt: new Date().toISOString(),
    },
    ...memory.facts.filter((item) => item.text !== trimmed),
  ].slice(0, 80);

  const nextMemory: ProjectMemory = {
    version: MEMORY_VERSION,
    projectRoot,
    facts: nextFacts,
  };

  await mkdir(getCacheDir(), { recursive: true, mode: 0o700 });
  await writeFile(getMemoryCachePath(projectRoot), JSON.stringify(nextMemory, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });

  return nextFacts[0]!;
}

export function getRelevantProjectMemory(query = "", limit = 6) {
  const memory = readProjectMemory();
  const terms = extractTerms(query);

  if (terms.length === 0) return memory.facts.slice(0, limit);

  return memory.facts
    .map((fact) => ({ fact, score: scoreMemoryFact(fact, terms) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.fact);
}

export async function searchRepoSymbols(query: string, options: { limit?: number; refresh?: boolean } = {}) {
  const index = await getRepoIndex({ refresh: options.refresh });
  const terms = extractTerms(query);
  const normalizedQuery = query.toLowerCase().trim();
  const limit = options.limit ?? 12;

  return index.files
    .flatMap((file) =>
      uniqueLimited([...file.symbols, ...file.exports], MAX_SYMBOLS_PER_FILE).map((symbol) => {
        const normalizedSymbol = symbol.toLowerCase();
        const score =
          normalizedSymbol === normalizedQuery
            ? 20
            : normalizedSymbol.includes(normalizedQuery)
              ? 12
              : terms.reduce((total, term) => total + (normalizedSymbol.includes(term) ? 4 : 0), 0);

        return {
          symbol,
          path: file.path,
          kind: file.kind,
          score,
        };
      }),
    )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);
}

export async function getAffectedTestsForPaths(
  paths: string[],
  options: { task?: string; refresh?: boolean; limit?: number } = {},
) {
  const index = await getRepoIndex({ refresh: options.refresh });
  const task = classifyAgentTask(options.task ?? paths.join(" "));
  const candidates = paths.map((path) => ({
    path: normalizePath(path),
    score: 10,
    reason: "provided path",
    symbols: [],
  }));
  const tests = selectAffectedTests(index, candidates, task, options.limit ?? 8);

  return {
    tests,
    verificationCommands: suggestVerificationCommands(index.projectRoot, task, tests),
  };
}

export async function getAgentAccelerationContext(options: {
  task: string;
  mode?: ModeType;
  refreshIndex?: boolean;
  limit?: number;
}): Promise<AgentAccelerationContext> {
  const [index] = await Promise.all([
    getRepoIndex({ refresh: options.refreshIndex }),
  ]);
  const task = classifyAgentTask(options.task);
  const limit = options.limit ?? (options.mode === Mode.ULTRA ? 14 : 10);
  const candidateFiles = selectCandidateFiles(index, task, limit);
  const affectedTests = selectAffectedTests(index, candidateFiles, task, 8);
  const verificationCommands = suggestVerificationCommands(index.projectRoot, task, affectedTests);
  const memory = getRelevantProjectMemory(options.task, 5);

  return {
    task,
    index: {
      ...index.stats,
      generatedAt: index.generatedAt,
      projectRoot: index.projectRoot,
    },
    candidateFiles,
    affectedTests,
    verificationCommands,
    modelRouting: modelRoutingHints(task),
    strategy: buildStrategy(task, candidateFiles),
    memory,
  };
}

function formatCandidateList(title: string, candidates: CandidateFile[]) {
  if (candidates.length === 0) return `${title}: none`;

  return [
    `${title}:`,
    ...candidates.slice(0, 8).map((candidate) => {
      const symbols = candidate.symbols.length > 0 ? ` symbols=${candidate.symbols.join(",")}` : "";
      return `- ${candidate.path} score=${candidate.score} reason=${candidate.reason}${symbols}`;
    }),
  ].join("\n");
}

export function formatAgentAccelerationContext(context: AgentAccelerationContext) {
  const lines = [
    "Fast workspace context:",
    `Task: kind=${context.task.kind} risk=${context.task.risk} write=${context.task.needsWrite} verify=${context.task.needsVerification}`,
    `Index: files=${context.index.indexedFileCount}/${context.index.fileCount} tests=${context.index.testCount} generated=${context.index.generatedAt}`,
    formatCandidateList("Likely files", context.candidateFiles),
    formatCandidateList("Affected tests", context.affectedTests),
    context.verificationCommands.length > 0
      ? `Verification: ${context.verificationCommands.join(" && ")}`
      : "Verification: no command inferred",
    `Strategy: ${context.strategy.join(" | ")}`,
    `Model routing: ${context.modelRouting.join(" | ")}`,
    context.memory.length > 0
      ? `Project memory: ${context.memory.map((fact) => fact.text).join(" | ")}`
      : "Project memory: empty",
  ];

  const formatted = lines.join("\n");
  return formatted.length > MAX_CONTEXT_CHARS
    ? `${formatted.slice(0, MAX_CONTEXT_CHARS)}\n... (fast context truncated)`
    : formatted;
}
