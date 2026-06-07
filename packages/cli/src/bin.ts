import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { TeamStore, type TeamDefinition, RuleEngine } from "@racore/team-engine";
import yaml from "js-yaml";
import dotenv from "dotenv";
import path from "node:path";
import readline from "node:readline";
import { getProviderAuth } from "./lib/provider-auth";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
});

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    team: { type: "string" },
    mode: { type: "string" },
    model: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const subcommand = positionals[0];

// ─── Team subcommands ─────────────────────────────────────────

if (subcommand === "team") {
  const teamCmd = positionals[1] as "list" | "create" | "edit" | "delete" | "import";
  const teamArg = positionals[2] ?? "";
  const store = new TeamStore();

  if (teamCmd === "list" || !teamCmd) {
    const names = store.listTeams();
    if (names.length === 0) {
      console.log("No teams configured. Run `racore team create <name>` to create one.");
    } else {
      for (const name of names) {
        const team = store.getTeam(name);
        if (team) {
          console.log(name + (team.displayName ? " (" + team.displayName + ")" : ""));
        }
      }
    }
    process.exit(0);
  }

  if (teamCmd === "create") {
    if (!teamArg) {
      console.error("Usage: racore team create <name>");
      process.exit(1);
    }
    const newTeam: TeamDefinition = {
      name: teamArg,
      displayName: teamArg,
      description: "A new team",
      processMode: "sequential",
      coordinator: { provider: "openrouter", model: "openai/gpt-5" },
      agents: [],
      defaults: { maxConcurrentAgents: 4 },
      rules: [],
    };
    try {
      store.saveTeam(newTeam);
      console.log("Team '" + teamArg + "' created. Edit it with `racore team edit " + teamArg + "`.");
    } catch (e) {
      console.error("Failed to create team:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    process.exit(0);
  }

  if (teamCmd === "delete") {
    if (!teamArg) {
      console.error("Usage: racore team delete <name>");
      process.exit(1);
    }
    if (store.deleteTeam(teamArg)) {
      console.log("Team '" + teamArg + "' deleted.");
    } else {
      console.error("Team '" + teamArg + "' not found.");
      process.exit(1);
    }
    process.exit(0);
  }

  if (teamCmd === "edit") {
    if (!teamArg) {
      console.error("Usage: racore team edit <name>");
      process.exit(1);
    }
    const team = store.getTeam(teamArg);
    if (!team) {
      console.error("Team '" + teamArg + "' not found.");
      process.exit(1);
    }
    console.log("# Team '" + teamArg + "' configuration (YAML):");
    console.log(yaml.dump(team));
    console.log("# Edit the team in TUI via `racore` then navigate to /teams.");
    process.exit(0);
  }

  if (teamCmd === "import") {
    const cwd = teamArg || process.cwd();
    if (!existsSync(cwd)) {
      console.error("Path does not exist: " + cwd);
      process.exit(1);
    }
    const ts = new TeamStore();
    const imported = ts.importFromProject(cwd);
    console.log("Imported " + imported.length + " team(s) from " + cwd + ".");
    process.exit(0);
  }

  console.log("Team commands:");
  console.log("  racore team list              List all teams");
  console.log("  racore team create <name>   Create a new team");
  console.log("  racore team edit <name>      Show team YAML");
  console.log("  racore team delete <name>    Delete a team");
  console.log("  racore team import [path]    Import teams from .racore/teams/");
  process.exit(0);
}

// ─── Rules subcommands ─────────────────────────────────────────

if (subcommand === "rules") {
  const ruleCmd = positionals[1] as "list" | "add" | "delete";
  const engine = new RuleEngine();

  if (ruleCmd === "list" || !ruleCmd) {
    const rules = engine.listRules("global");
    if (rules.length === 0) {
      console.log("No global rules. Use `racore rules add --content '...'` to add one.");
    } else {
      for (const rule of rules) {
        const status = rule.enabled ? "[ON] " : "[OFF] ";
        console.log(status + "P" + rule.priority + " [" + rule.scope + "] " + rule.id);
        console.log("  " + rule.content.slice(0, 80));
      }
    }
    process.exit(0);
  }

  if (ruleCmd === "add") {
    const { values: ruleOpts } = parseArgs({
      args: positionals.slice(2),
      options: {
        content: { type: "string" },
        priority: { type: "string" },
        scope: { type: "string" },
      },
    });
    if (!ruleOpts.content) {
      console.error("Usage: racore rules add --content 'rule text' [--priority 5] [--scope global]");
      process.exit(1);
    }
    const rule = {
      id: "rule-" + crypto.randomUUID().slice(0, 8),
      content: ruleOpts.content,
      priority: Number(ruleOpts.priority ?? 5),
      scope: (ruleOpts.scope ?? "global") as "global" | "team" | "agent",
      enabled: true,
      tags: [] as string[],
    };
    engine.addRule(rule);
    console.log("Rule added (P" + rule.priority + ", " + rule.scope + ").");
    process.exit(0);
  }

  if (ruleCmd === "delete") {
    const ruleId = positionals[2];
    if (!ruleId) {
      console.error("Usage: racore rules delete <rule-id>");
      process.exit(1);
    }
    console.log("Rules deletion is handled via TUI (`racore` then navigate to /rules).");
    process.exit(0);
  }

  console.log("Rules commands:");
  console.log("  racore rules list                  List global rules");
  console.log("  racore rules add --content '...'  Add a global rule");
  console.log("  racore rules delete <id>           Delete a rule (use TUI)");
  process.exit(0);
}

// ─── Help ─────────────────────────────────────────────────────

if (opts.help || subcommand === "help") {
  console.log("R'a Core — Multi-Agent CLI Coder");
  console.log("");
  console.log("Usage:");
  console.log("  racore                          Start the TUI (default)");
  console.log("  racore --team <name>            Start TUI and open team session immediately");
  console.log("  racore --mode plan              Start in Plan mode");
  console.log("  racore --model <model>          Start with a specific model");
  console.log("");
  console.log("Team commands (headless):");
  console.log("  racore team list                List all teams");
  console.log("  racore team create <name>       Create a new team");
  console.log("  racore team edit <name>         Show team YAML");
  console.log("  racore team delete <name>        Delete a team");
  console.log("  racore team import [path]        Import teams from project");
  console.log("");
  console.log("Rule commands (headless):");
  console.log("  racore rules list               List global rules");
  console.log("  racore rules add --content '...'  Add a rule");
  process.exit(0);
}

// ─── TUI Fallback REPL ────────────────────────────────────────

async function startConsoleMode() {
  console.log("\n==================================================");
  console.log("Welcome to R'a Core Console Mode (Node.js Fallback)");
  console.log("==================================================");
  console.log("TUI mode requires Bun (due to @opentui requiring bun:ffi).");
  console.log("Running in pure Node.js interactive Console mode instead.\n");

  const store = new TeamStore();
  let teams = store.listTeams();
  
  if (teams.length === 0) {
    const builtins = store.listBuiltInTeams();
    for (const team of builtins) {
      store.saveTeam(team);
    }
    teams = store.listTeams();
  }

  console.log("Available Teams:");
  teams.forEach((t, i) => console.log(`  [${i + 1}] ${t}`));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  let selectedTeamName = teams[0] || "backend";
  if (teams.length > 1) {
    const answer = await question(`\nSelect a team (1-${teams.length}) [default: 1]: `);
    const index = parseInt(answer.trim(), 10) - 1;
    if (index >= 0 && index < teams.length) {
      selectedTeamName = teams[index]!;
    }
  }

  const team = store.getTeam(selectedTeamName);
  if (!team) {
    console.error("Error: Team not found.");
    rl.close();
    process.exit(1);
  }

  console.log(`\nActive Team: ${team.displayName || team.name}`);
  console.log(`Coordinator: ${team.coordinator.provider} / ${team.coordinator.model}`);
  console.log("Agents:");
  if (team.agents && team.agents.length > 0) {
    team.agents.forEach((a) => console.log(`  - ${a.role} (${a.id})`));
  } else {
    // Add default agents if empty
    const defaultTeam = store.listBuiltInTeams().find((t) => t.name === team.name) || store.listBuiltInTeams()[0]!;
    team.agents = defaultTeam.agents;
    team.agents.forEach((a) => console.log(`  - ${a.role} (${a.id})`));
  }
  console.log("\nType your task prompt below. Type 'exit' or 'quit' to leave.\n");

  while (true) {
    const prompt = await question("\nPrompt > ");
    if (!prompt || prompt.trim() === "") continue;
    if (prompt.trim().toLowerCase() === "exit" || prompt.trim().toLowerCase() === "quit") {
      break;
    }

    console.log("\n[Coordinator] Planning task...");
    try {
      const provider = team.coordinator.provider;
      const auth = getProviderAuth(provider as any);
      if (!auth || !auth.apiKey) {
        console.error(`\nError: Provider '${provider}' is not connected. Connect it first using:`);
        console.error(`  racore rules list (or configure credentials in .env/environment)`);
        continue;
      }

      const coordinator = new Coordinator(team, {
        onLog: (agentId, log) => {
          console.log(`[${agentId}] ${log}`);
        },
        onTaskComplete: (taskId, result) => {
          console.log(`[Queue] Task completed: ${taskId}`);
        },
        onTaskFail: (taskId, error) => {
          console.error(`[Queue] Task failed: ${taskId} - ${error}`);
        },
        onAllDone: () => {}
      });

      const planned = await coordinator.plan(prompt.trim());
      console.log(`[Coordinator] Planned ${planned.length} tasks:`);
      planned.forEach((t, i) => console.log(`  ${i + 1}. [${t.assignedAgent}] ${t.title} (depends on: ${t.dependsOn?.join(", ") || "none"})`));
      console.log("\n[Coordinator] Executing tasks...\n");

      await new Promise<void>((resolvePromise) => {
        const runScheduler = () => {
          const readyTasks = coordinator.getTaskQueue().getReadyTasks();
          for (const task of readyTasks) {
            if (task.status === "pending" || task.status === "queued") {
              const agent = team.agents.find((a) => a.id === task.assignedAgent && a.enabled);
              if (agent) {
                void coordinator.assignTask(task, agent).catch(() => {});
              }
            }
          }
        };

        coordinator.getTaskQueue().onEvent((event) => {
          if (event.type === "task_completed" || event.type === "task_failed") {
            runScheduler();
          }
          if (event.type === "all_done") {
            console.log("\n[Coordinator] All tasks finished!");
            const allResults = coordinator.getTaskQueue().getAllTasks();
            console.log("\n=== Execution Summary ===");
            allResults.forEach((t) => {
              console.log(`\n[${t.assignedAgent}] ${t.title}:`);
              console.log(t.result ? JSON.stringify(t.result, null, 2) : "No result output.");
            });
            resolvePromise();
          }
        });

        runScheduler();
      });

    } catch (err) {
      console.error("\nExecution failed:", err instanceof Error ? err.message : String(err));
    }
  }

  rl.close();
  console.log("\nGoodbye!");
  process.exit(0);
}

// ─── TUI Mode ────────────────────────────────────────────────

if (opts.team) process.env["RACORE_TEAM"] = opts.team;
if (opts.mode) process.env["RACORE_MODE"] = opts.mode;
if (opts.model) process.env["RACORE_MODEL"] = opts.model;

if (process.versions.bun === undefined) {
  // Running under Node.js, try to spawn bun for TUI mode
  const args = process.argv.slice(1);
  const child = spawn("bun", args, { stdio: "inherit" });
  
  let spawnedSuccessfully = true;
  child.on("error", () => {
    spawnedSuccessfully = false;
    // Bun not found, run console mode fallback
    void startConsoleMode();
  });

  child.on("exit", (code) => {
    if (spawnedSuccessfully) {
      process.exit(code ?? 0);
    }
  });
} else {
  // Running under Bun, dynamically import the TUI app
  // This avoids loading React / @opentui at start of headless commands under Node.js
  const indexUrl = new URL("./index.js", import.meta.url).href;
  await import(indexUrl);
}
