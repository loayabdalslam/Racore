import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

async function sampleProcessTree(rootPid) {
  if (process.platform === "win32") return null;
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss=,%cpu="], { timeout: 1000 });
    const rows = stdout.trim().split("\n").map(line => { const [pid, ppid, rss, cpu] = line.trim().split(/\s+/); return { pid:Number(pid), ppid:Number(ppid), rss:Number(rss)||0, cpu:Number(cpu)||0 }; });
    const children = new Map(); for (const row of rows) { if (!children.has(row.ppid)) children.set(row.ppid, []); children.get(row.ppid).push(row.pid); }
    const pids = new Set([rootPid]); const stack = [rootPid];
    while (stack.length) { const pid = stack.pop(); for (const child of children.get(pid) ?? []) if (!pids.has(child)) { pids.add(child); stack.push(child); } }
    let rssKb=0, cpuPercent=0; for (const row of rows) if (pids.has(row.pid)) { rssKb += row.rss; cpuPercent += row.cpu; }
    return { rssKb, cpuPercent };
  } catch { return null; }
}

export function runObservedProcess(command, args, { cwd, env = {}, timeoutMs = 300000, onStdout, onStderr, sampleEveryMs = 500 } = {}) {
  return new Promise((resolve) => {
    const startedAt=Date.now(); let firstOutputMs=null, stdout="", stderr="", timedOut=false, peakRssKb=0, peakCpuPercent=0, samples=0, sampleBusy=false, settled=false;
    const child = spawn(command, args, { cwd, env:{...process.env,...env}, stdio:["ignore","pipe","pipe"], shell:false });
    const observe = (kind, chunk) => { if (firstOutputMs === null) firstOutputMs = Date.now()-startedAt; const text=chunk.toString(); if (kind === "stdout") { stdout += text; onStdout?.(text); } else { stderr += text; onStderr?.(text); } };
    child.stdout?.on("data", c => observe("stdout", c)); child.stderr?.on("data", c => observe("stderr", c));
    const sampler = setInterval(async () => { if (!child.pid || sampleBusy) return; sampleBusy=true; const sample=await sampleProcessTree(child.pid); sampleBusy=false; if (!sample) return; samples += 1; peakRssKb=Math.max(peakRssKb, sample.rssKb); peakCpuPercent=Math.max(peakCpuPercent, sample.cpuPercent); }, sampleEveryMs); sampler.unref();
    const timeout = setTimeout(() => { timedOut=true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 1500).unref(); }, timeoutMs); timeout.unref();
    const finish = (result) => { if (settled) return; settled=true; clearInterval(sampler); clearTimeout(timeout); resolve({ ...result, durationMs:Date.now()-startedAt, firstOutputMs, timedOut, stdout, stderr, peakRssMb:peakRssKb ? peakRssKb/1024 : null, peakCpuPercent:samples ? peakCpuPercent : null, resourceSamples:samples }); };
    child.on("error", error => finish({ exitCode:127, signal:null, spawnError:error.message }));
    child.on("close", (code, signal) => finish({ exitCode:code ?? 1, signal, spawnError:null }));
  });
}
