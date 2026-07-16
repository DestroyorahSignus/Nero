/**
 * REBELLION runner.
 *   npx tsx lib/evals/run.ts            → full loop (VERGIL+NERO+LADY+Reflexion)
 *   npx tsx lib/evals/run.ts --bare     → bare executor (ablation baseline)
 *   npx tsx lib/evals/run.ts --only c1,d2
 *
 * Prints a per-task table and the headline numbers for the README:
 * task completion rate, mean critic score, tokens and cost.
 */
import { TASKS } from "./suite";
import { runNero, type OrchestratorSink } from "@/lib/agents/orchestrator";
import { execute } from "@/lib/agents/nero";
import { drawYamato } from "@/lib/mcp/yamato";
import { TokenBudget } from "@/lib/budget";

const bare = process.argv.includes("--bare");
const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const only = onlyArg
  ? (process.argv[process.argv.indexOf(onlyArg) + 1] ?? "").split(",")
  : null;

const silentSink: OrchestratorSink = {
  plan: () => {},
  agentStep: () => {},
  toolCall: (_id, d) => {
    if (d.status === "running") process.stdout.write(`    ↳ ${d.toolName}\n`);
  },
  verdict: (_id, d) =>
    process.stdout.write(`    ⚖ LADY: ${d.score}/100 rank ${d.rank} ${d.pass ? "PASS" : "FAIL"}\n`),
  reflection: (_id, d) =>
    process.stdout.write(`    ↻ reflection: ${d.reflection.slice(0, 100)}…\n`),
  metrics: () => {},
  status: () => {},
  approval: () => {},
  span: () => {},
  textDelta: () => {},
  resetText: () => {},
};

async function runBare(goal: string, budget: TokenBudget): Promise<string> {
  const yamato = await drawYamato();
  try {
    const { text } = await execute(
      goal,
      { strategy: "Answer the goal directly.", steps: [{ title: "Answer", toolHint: "none", successCriteria: "Goal answered" }] },
      yamato.tools,
      budget,
      [],
      { onToolStart: () => {}, onToolEnd: () => {}, onTextDelta: () => {} },
    );
    return text;
  } finally {
    await yamato.close();
  }
}

async function main() {
  const tasks = only ? TASKS.filter((t) => only.includes(t.id)) : TASKS;
  console.log(
    `\nREBELLION · ${bare ? "BARE executor (ablation)" : "FULL loop (plan+critique+reflexion)"} · ${tasks.length} tasks\n`,
  );

  let passed = 0;
  let tokens = 0;
  let cost = 0;
  const rows: string[] = [];

  for (const task of tasks) {
    process.stdout.write(`▸ ${task.id} [${task.category}] ${task.goal.split("\n")[0].slice(0, 70)}\n`);
    const t0 = Date.now();
    try {
      let answer: string;
      let attempts = 1;
      if (bare) {
        const budget = new TokenBudget();
        answer = await runBare(task.goal, budget);
        tokens += budget.totalTokens;
        cost += budget.estCostUsd;
      } else {
        // No operator at the CLI — approvals off so run_js executes freely.
        const res = await runNero(task.goal, `eval-${task.id}-${Date.now()}`, silentSink, {
          approvalMode: false,
        });
        answer = res.answer;
        attempts = res.attempts;
        tokens += res.budget.totalTokens;
        cost += res.budget.estCostUsd;
      }
      const ok = task.check(answer);
      if (ok) passed += 1;
      rows.push(
        `${ok ? "✅" : "❌"} ${task.id.padEnd(4)} ${task.category.padEnd(10)} attempts=${attempts} ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      process.stdout.write(`    ${ok ? "✅ correct" : "❌ wrong"}\n`);
    } catch (err) {
      rows.push(`💥 ${task.id.padEnd(4)} ${task.category.padEnd(10)} error: ${err instanceof Error ? err.message : err}`);
      process.stdout.write(`    💥 ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log("\n──────── results ────────");
  rows.forEach((r) => console.log(r));
  console.log("─────────────────────────");
  console.log(`Task completion: ${passed}/${tasks.length} (${((100 * passed) / tasks.length).toFixed(1)}%)`);
  console.log(`Tokens: ${tokens.toLocaleString()} · est cost: $${cost.toFixed(3)}`);
  console.log(
    bare
      ? "Baseline done. Now run the full loop:  npm run evals"
      : "Full loop done. For the ablation baseline:  npm run evals -- --bare",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
