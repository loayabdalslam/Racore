import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCommand } from "./utils.mjs";

function deepEqual(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
export async function verifyTask(task, workspace) {
  const checks=[];
  for (const rule of task.verify??[]) {
    let passed=false, detail="";
    if (rule.type==="fileExists") { passed=existsSync(resolve(workspace,rule.path)); detail=passed?"exists":"missing"; }
    else if (rule.type==="fileEquals") { const path=resolve(workspace,rule.path); const actual=existsSync(path)?readFileSync(path,"utf8"):null; passed=actual===String(rule.value); detail=passed?"exact match":`expected exact content in ${rule.path}`; }
    else if (rule.type==="fileContains") { const path=resolve(workspace,rule.path); const actual=existsSync(path)?readFileSync(path,"utf8"):""; passed=actual.includes(String(rule.value)); detail=passed?"contains value":`missing required content in ${rule.path}`; }
    else if (rule.type==="jsonEquals") { const path=resolve(workspace,rule.path); try { const actual=JSON.parse(readFileSync(path,"utf8")); passed=deepEqual(actual,rule.value); detail=passed?"JSON match":"JSON differs"; } catch (error) { detail=error instanceof Error?error.message:String(error); } }
    else if (rule.type==="command") { const result=await runCommand(rule.command,rule.args??[],{cwd:workspace,env:rule.env,timeoutMs:rule.timeoutMs??60000}); const exitOk=result.exitCode===(rule.exitCode??0)&&!result.timedOut; const stdoutOk=rule.stdoutEquals===undefined||result.stdout===String(rule.stdoutEquals); const stdoutContainsOk=rule.stdoutContains===undefined||result.stdout.includes(String(rule.stdoutContains)); const stderrOk=rule.stderrEquals===undefined||result.stderr===String(rule.stderrEquals); passed=exitOk&&stdoutOk&&stdoutContainsOk&&stderrOk; detail=(result.stdout||result.stderr).slice(0,1000); }
    else detail=`unknown verifier type: ${rule.type}`;
    checks.push({...rule,passed,detail});
  }
  return { passed:checks.length>0&&checks.every(c=>c.passed), checks };
}
