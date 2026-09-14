import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { interpolate, readJson } from "./utils.mjs";
import { runObservedProcess } from "./process-runner.mjs";

function extractJsonMetrics(path) {
  if (!path || !existsSync(path)) return {};
  try { const payload=readJson(path); return { harnessOk:payload.ok===true, inputTokens:Number(payload.inputTokens??0), outputTokens:Number(payload.outputTokens??0), totalTokens:Number(payload.totalTokens??0), toolCalls:Number(payload.toolCalls??0), continuationRounds:Number(payload.continuationRounds??0), stopReason:payload.stopReason??null, model:payload.model??null, provider:payload.provider??null, rawResult:payload }; } catch { return {}; }
}
function genericMetricsFromStdout(stdout) {
  const text=stdout.trim(); if (!text.startsWith("{") || !text.endsWith("}")) return {};
  try { const payload=JSON.parse(text); return { harnessOk:payload.ok===true || payload.success===true, inputTokens:Number(payload.inputTokens??payload.input_tokens??0), outputTokens:Number(payload.outputTokens??payload.output_tokens??0), totalTokens:Number(payload.totalTokens??payload.total_tokens??0), toolCalls:Number(payload.toolCalls??payload.tool_calls??0), stopReason:payload.stopReason??payload.stop_reason??null, rawResult:payload }; } catch { return {}; }
}

async function runRacore({ task, workspace, runArtifactDir, config }) {
  mkdirSync(runArtifactDir,{recursive:true});
  const resultPath=resolve(runArtifactDir,"racore-result.json"); const runtime=config.runtime??process.env.RACORE_BENCH_RUNTIME??"bun"; const cliBin=config.cli??process.env.RACORE_BENCH_CLI??resolve(config.repoRoot,"packages/cli/bin/racore");
  const args=[cliBin,"run","--json","--quiet","--yolo","--cwd",workspace,"--output",resultPath];
  if (config.provider) args.push("--provider",config.provider); if (config.model) args.push("--model",config.model); if (config.mode) args.push("--mode",config.mode); if (config.maxRounds) args.push("--max-rounds",String(config.maxRounds)); args.push("-p",task.prompt);
  const processResult=await runObservedProcess(runtime,args,{cwd:config.repoRoot,env:config.env,timeoutMs:task.timeoutMs??config.timeoutMs}); return { ...processResult, ...extractJsonMetrics(resultPath), command:runtime, args, resultPath };
}
async function runGeneric({ task, workspace, runArtifactDir, config }) {
  if (!config.adapterPath) throw new Error("generic harness requires --adapter <file.json>");
  const adapter=readJson(config.adapterPath); const resultPath=resolve(runArtifactDir,"harness-result.json"); const vars={prompt:task.prompt,workspace,result:resultPath,taskId:task.id};
  const command=interpolate(adapter.command,vars); const args=(adapter.args??[]).map(arg=>interpolate(arg,vars)); const env=Object.fromEntries(Object.entries(adapter.env??{}).map(([k,v])=>[k,interpolate(v,vars)]));
  const processResult=await runObservedProcess(command,args,{cwd:adapter.cwd?interpolate(adapter.cwd,vars):workspace,env:{...env,...config.env},timeoutMs:task.timeoutMs??config.timeoutMs}); const configuredResult=adapter.resultFile?resolve(workspace,interpolate(adapter.resultFile,vars)):resultPath;
  return { ...processResult, ...(adapter.jsonStdout?genericMetricsFromStdout(processResult.stdout):{}), ...extractJsonMetrics(configuredResult), command, args, resultPath:configuredResult };
}
async function runMock({ task, workspace, runArtifactDir }) {
  mkdirSync(runArtifactDir,{recursive:true}); const startedAt=Date.now();
  for (const [path,content] of Object.entries(task.mock?.files??{})) { const target=resolve(workspace,path); mkdirSync(dirname(target),{recursive:true}); writeFileSync(target,String(content),"utf8"); }
  await new Promise(r=>setTimeout(r,Number(task.mock?.sleepMs??5)));
  const exitCode=task.mock?.exitCode??0; return { exitCode,signal:null,spawnError:null,durationMs:Date.now()-startedAt,firstOutputMs:0,timedOut:false,stdout:task.mock?.stdout??"mock complete\n",stderr:task.mock?.stderr??"",peakRssMb:null,peakCpuPercent:null,resourceSamples:0,harnessOk:exitCode===0,inputTokens:Number(task.mock?.inputTokens??100),outputTokens:Number(task.mock?.outputTokens??25),totalTokens:Number(task.mock?.totalTokens??125),toolCalls:Number(task.mock?.toolCalls??2),continuationRounds:Number(task.mock?.continuationRounds??0),stopReason:"completed",command:"mock",args:[],resultPath:null };
}
export async function runHarness(context) { if (context.config.harness==="racore") return runRacore(context); if (context.config.harness==="mock") return runMock(context); if (context.config.harness==="generic") return runGeneric(context); throw new Error(`Unknown harness: ${context.config.harness}`); }
