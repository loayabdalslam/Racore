import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

export function ensureDir(path) { mkdirSync(path, { recursive: true }); return path; }
export function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
export function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
export function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run"; }
export function timestampId(date = new Date()) { return date.toISOString().replace(/[:.]/g, "-"); }
export function sha256(content) { return createHash("sha256").update(content).digest("hex"); }
export function percentile(values, p) { if (!values.length) return 0; const sorted = [...values].sort((a,b)=>a-b); const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)); return sorted[index]; }
export function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
export function round(value, digits = 2) { if (!Number.isFinite(value)) return 0; const scale = 10 ** digits; return Math.round(value * scale) / scale; }
export function formatMs(ms) { if (ms < 1000) return `${Math.round(ms)}ms`; if (ms < 60000) return `${(ms/1000).toFixed(2)}s`; const minutes = Math.floor(ms/60000); return `${minutes}m ${((ms%60000)/1000).toFixed(1)}s`; }

export function parseArgv(argv) {
  const positionals = []; const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) { positionals.push(arg); continue; }
    if (arg === "--") { positionals.push(...argv.slice(index + 1)); break; }
    const eq = arg.indexOf("="); let key = arg; let value = true;
    if (eq > 0) { key = arg.slice(0, eq); value = arg.slice(eq + 1); }
    else if (argv[index + 1] && !argv[index + 1].startsWith("-")) { value = argv[++index]; }
    const previous = options.get(key);
    if (previous === undefined) options.set(key, value); else if (Array.isArray(previous)) previous.push(value); else options.set(key, [previous, value]);
  }
  return { positionals, options };
}
export function option(parsed, name, fallback = undefined) { const value = parsed.options.get(name); if (Array.isArray(value)) return value[value.length - 1]; return value === undefined ? fallback : value; }
export function options(parsed, name) { const value = parsed.options.get(name); if (value === undefined) return []; return Array.isArray(value) ? value : [value]; }
export function intOption(parsed, name, fallback) { const raw = option(parsed, name, fallback); const value = Number(raw); if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`); return value; }
export function boolOption(parsed, name) { const raw = option(parsed, name, false); if (raw === true) return true; return ["1","true","yes","on"].includes(String(raw).toLowerCase()); }
export function interpolate(value, vars) { return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? `{${key}}`); }

export function snapshotFiles(root, ignored = [".git", ".hbench"]) {
  const result = new Map(); if (!existsSync(root)) return result;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (ignored.includes(name)) continue;
      const path = join(dir, name); const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && stat.size <= 10 * 1024 * 1024) { const rel = relative(root, path).replaceAll("\\", "/"); result.set(rel, sha256(readFileSync(path))); }
    }
  };
  walk(root); return result;
}
export function diffSnapshots(before, after) { let added=0, modified=0, deleted=0; for (const [path, hash] of after) { if (!before.has(path)) added += 1; else if (before.get(path) !== hash) modified += 1; } for (const path of before.keys()) if (!after.has(path)) deleted += 1; return { added, modified, deleted, changed: added + modified + deleted }; }

export function runCommand(command, args, { cwd, env = {}, timeoutMs = 60000, capture = true } = {}) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now(); let stdout="", stderr="", timedOut=false, settled=false;
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: capture ? ["ignore","pipe","pipe"] : "inherit", shell: false });
    if (capture) { child.stdout?.on("data", c => { stdout += c.toString(); }); child.stderr?.on("data", c => { stderr += c.toString(); }); }
    const timer = setTimeout(() => { timedOut=true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 1500).unref(); }, timeoutMs);
    const finish = (result) => { if (settled) return; settled=true; clearTimeout(timer); resolvePromise({ ...result, durationMs: Date.now()-startedAt, timedOut, stdout, stderr }); };
    child.on("error", error => finish({ exitCode:127, signal:null, stderr:`${stderr}${error.message}` }));
    child.on("close", (code, signal) => finish({ exitCode:code ?? 1, signal }));
  });
}
export function resolveFrom(base, path) { return resolve(base, path); }
