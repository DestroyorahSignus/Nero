/**
 * End-to-end orchestrator tests with NO API key and NO network.
 *
 * The real runNero / VERGIL / NERO / LADY / YAMATO / TRISH / TokenBudget run
 * unmodified — only the LLM itself is swapped for MockLanguageModelV4 by
 * patching resolveModel(). Tools execute for real, so the tool trace and the
 * final answer are genuine; only model *quality* is simulated.
 *
 * Run: npx tsx tests/e2e-mock.ts
 */
import type { LanguageModelV4StreamPart, LanguageModelV4GenerateResult } from "@ai-sdk/provider";

process.env.NERO_MAX_REFLECTIONS = "2";
process.env.YAMATO_MODE = "local";

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
}

const finish = (u: "stop" | "tool-calls") => ({ unified: u, raw: undefined }) as const;

const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});

function streamOf(parts: LanguageModelV4StreamPart[]) {
  return {
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(c) { for (const p of parts) c.enqueue(p); c.close(); },
    }),
  };
}

/** Emit a JSON payload as streamed text deltas (what streamObject consumes). */
function textStream(json: unknown, inTok = 100, outTok = 50): LanguageModelV4StreamPart[] {
  const s = typeof json === "string" ? json : JSON.stringify(json);
  const chunks = s.match(/[\s\S]{1,18}/g) ?? [s];
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t0" },
    ...chunks.map((delta) => ({ type: "text-delta" as const, id: "t0", delta })),
    { type: "text-end", id: "t0" },
    { type: "finish", finishReason: finish("stop"), usage: usage(inTok, outTok) },
  ];
}

function toolCallStream(toolName: string, input: unknown): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `call-${Math.random().toString(36).slice(2, 8)}`, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: finish("tool-calls"), usage: usage(200, 30) },
  ];
}

async function main() {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { scoreToRank } = await import("@/ai/types");
  const realProviders = await import("@/lib/providers");

  // Swap ONLY the model factory. ESM namespaces are read-only, so intercept
  // module resolution instead — this keeps lib/providers.ts untouched and the
  // rest of the stack (orchestrator, agents, tools) completely real.
  let makeModel: (role: string) => unknown = () => { throw new Error("no model"); };
  const NodeModule = require("node:module") as any;
  const originalLoad = NodeModule._load;
  NodeModule._load = function (request: string, ...rest: unknown[]) {
    if (request === "@/lib/providers" || /[\\/]lib[\\/]providers(\.[tj]s)?$/.test(request)) {
      return { ...realProviders, resolveModel: (role: string) => makeModel(role) };
    }
    return originalLoad.call(this, request, ...rest);
  };

  const { runNero } = await import("@/lib/agents/orchestrator");

  // Scenario script: what each role returns, per attempt.
  type Script = {
    plan: (attempt: number) => unknown;
    exec: (attempt: number, step: number) => LanguageModelV4StreamPart[];
    verdict: (attempt: number) => unknown;
  };
  let script: Script;
  let attemptOf = { planner: 0, critic: 0 };
  let execStep = 0;
  const calls: string[] = [];

  makeModel = (role: string) =>
    new MockLanguageModelV4({
      modelId: `mock-${role}`,
      doStream: async () => {
        calls.push(role);
        if (role === "planner") { execStep = 0; return streamOf(textStream(script.plan(++attemptOf.planner))); }
        return streamOf(script.exec(attemptOf.planner, execStep++));
      },
      doGenerate: async (): Promise<LanguageModelV4GenerateResult> => {
        calls.push(role);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(script.verdict(++attemptOf.critic)) }],
          finishReason: finish("stop"),
          usage: usage(300, 80),
          warnings: [],
        };
      },
    });

  const PLAN = (strategy: string, hint: string) => ({
    strategy,
    steps: [{ title: "Compute the answer", toolHint: hint, successCriteria: "The exact integer is stated" }],
  });
  const VERDICT = (score: number, pass: boolean, critique: string, reflection: string) => ({
    criteria: [
      { name: "task_completion", score, justification: "j" },
      { name: "tool_usage", score, justification: "j" },
      { name: "grounding", score, justification: "j" },
    ],
    overallScore: score, pass, critique, reflection,
  });

  function newSink() {
    const rec = {
      plans: [] as any[], steps: [] as any[], tools: [] as any[], verdicts: [] as any[],
      reflections: [] as any[], statuses: [] as any[], spans: [] as any[], approvals: [] as any[],
      metrics: null as any, texts: [] as string[], resets: 0,
    };
    let cur = "";
    const sink = {
      plan: (_i: string, d: any) => rec.plans.push(d),
      agentStep: (_i: string, d: any) => rec.steps.push(d),
      toolCall: (_i: string, d: any) => rec.tools.push(d),
      verdict: (_i: string, d: any) => rec.verdicts.push(d),
      reflection: (_i: string, d: any) => rec.reflections.push(d),
      metrics: (d: any) => { rec.metrics = d; },
      status: (d: any) => rec.statuses.push(d),
      approval: (i: string, d: any) => rec.approvals.push({ id: i, ...d }),
      span: (_i: string, d: any) => rec.spans.push(d),
      textDelta: (d: string) => { cur += d; },
      resetText: () => { rec.resets++; if (cur) rec.texts.push(cur); cur = ""; },
    };
    return { rec, sink, flush: () => { if (cur) rec.texts.push(cur); } };
  }

  // ══ SCENARIO 1: Reflexion — fail, reflect, re-plan, pass ═════════
  console.log("\nSCENARIO 1 — Reflexion loop (fail → reflect → retry → pass)");
  {
    attemptOf = { planner: 0, critic: 0 }; calls.length = 0;
    script = {
      plan: (a) => PLAN(a === 1 ? "Answer from memory" : "Compute it with run_js this time", a === 1 ? "none" : "run_js"),
      exec: (attempt, step) => {
        if (attempt === 1) return textStream("The 40th Fibonacci number is about 102 million.", 400, 20);
        if (step === 0) return toolCallStream("run_js", { code: "let a=1,b=1;for(let i=3;i<=40;i++){[a,b]=[b,a+b]}b" });
        return textStream("The 40th Fibonacci number is exactly 102334155.", 500, 25);
      },
      verdict: (a) => a === 1
        ? VERDICT(45, false, "Answer is vague and ungrounded — no tool was used.", "Use run_js to compute F(40) exactly and state the integer.")
        : VERDICT(95, true, "Exact, tool-grounded answer.", ""),
    };

    const { rec, sink, flush } = newSink();
    const res = await runNero("Compute the 40th Fibonacci number exactly", "e2e-reflexion", sink as any, { approvalMode: false });
    flush();

    check("run reports 2 attempts", res.attempts === 2, res.attempts);
    check("terminal phase is done", rec.statuses.at(-1)?.phase === "done", rec.statuses.at(-1));
    check("phases follow plan→exec→judge→reflect→plan→exec→judge",
      rec.statuses.map((s: any) => s.phase).join(",") === "planning,executing,critiquing,reflecting,planning,executing,critiquing,done",
      rec.statuses.map((s: any) => s.phase).join(","));
    check("LLM call order VERGIL→NERO→LADY ×2", calls.join(",") === "planner,executor,critic,planner,executor,executor,critic", calls.join(","));
    check("attempt 1 failed (score 45, rank C)", rec.verdicts[0]?.pass === false && rec.verdicts[0]?.rank === scoreToRank(45), rec.verdicts[0]);
    check("attempt 2 passed (score 95, rank SS)", rec.verdicts[1]?.pass === true && rec.verdicts[1]?.rank === "SS", rec.verdicts[1]);
    check("reflection stored exactly once", rec.reflections.length === 1, rec.reflections.length);
    check("reflection carries LADY's actionable advice", /run_js/.test(rec.reflections[0]?.reflection ?? ""), rec.reflections[0]);
    check("re-plan differs from first plan", rec.plans.at(-1)?.strategy !== rec.plans[0]?.strategy, [rec.plans[0]?.strategy, rec.plans.at(-1)?.strategy]);
    check("second plan switched toolHint to run_js", rec.plans.at(-1)?.steps?.[0]?.toolHint === "run_js", rec.plans.at(-1)?.steps?.[0]);

    // REAL tool execution
    const done = rec.tools.filter((t: any) => t.status === "done");
    check("run_js actually executed (real tool, not mocked)", done.length === 1 && done[0].toolName === "run_js", done[0]);
    check("real tool returned the true value 102334155", done[0]?.output?.result === "102334155", done[0]?.output);
    check("tool call reconciles running→done under one id", rec.tools.filter((t: any) => t.callId === done[0]?.callId).length === 2, rec.tools.length);
    check("tool latency recorded", typeof done[0]?.latencyMs === "number", done[0]?.latencyMs);

    check("resetText called before each attempt", rec.resets >= 2, rec.resets);
    check("answers kept separate, not concatenated", rec.texts.length === 2 && !/about 102 million.*102334155/s.test(rec.texts[1]), rec.texts);
    check("final answer is attempt 2's", /102334155/.test(res.answer) && !/about 102 million/.test(res.answer), res.answer);
    check("spans recorded for all 3 roles", new Set(rec.spans.map((s: any) => s.role)).size === 3, rec.spans.map((s: any) => s.role));
    check("spans have non-negative duration", rec.spans.every((s: any) => s.durMs >= 0 && s.startMs >= 0), true);
    check("budget accumulated across both attempts (3 recorded usages x2)", rec.metrics.totalTokens > 0 && rec.metrics.llmCalls === 6, { t: rec.metrics.totalTokens, c: rec.metrics.llmCalls });
    check("metrics cost is a positive upper bound", rec.metrics.estCostUsd > 0, rec.metrics.estCostUsd);
    check("agent steps marked done/failed correctly", rec.steps.filter((s: any) => s.agent === "LADY" && s.status === "failed").length === 1, rec.steps.filter((s: any) => s.agent === "LADY"));
  }

  // ══ SCENARIO 2: budget wall ══════════════════════════════════════
  console.log("\nSCENARIO 2 — TokenBudget stops the loop");
  {
    process.env.NERO_TOKEN_BUDGET = "500";
    attemptOf = { planner: 0, critic: 0 }; calls.length = 0;
    script = {
      plan: () => PLAN("burn tokens", "none"),
      exec: () => textStream("a partial answer", 5000, 5000),
      verdict: () => VERDICT(10, false, "bad", "try again"),
    };
    const { rec, sink } = newSink();
    const res = await runNero("burn", "e2e-budget", sink as any, { approvalMode: false });
    check("terminal phase is budget_exceeded", rec.statuses.at(-1)?.phase === "budget_exceeded", rec.statuses.at(-1));
    check("stopped after 1 attempt, not 3", res.attempts === 1, res.attempts);
    check("budget message names the cap", /500/.test(rec.statuses.at(-1)?.message ?? ""), rec.statuses.at(-1)?.message);
    check("best-so-far answer still returned", res.answer.length > 0, res.answer);
    check("budget.exceeded is true", res.budget.exceeded === true);
    delete process.env.NERO_TOKEN_BUDGET;
  }

  // ══ SCENARIO 3: attempt ceiling ══════════════════════════════════
  console.log("\nSCENARIO 3 — attempt ceiling (never loops forever)");
  {
    attemptOf = { planner: 0, critic: 0 }; calls.length = 0;
    script = {
      plan: () => PLAN("try", "none"),
      exec: () => textStream("still wrong", 50, 10),
      verdict: () => VERDICT(20, false, "still wrong", "try harder"),
    };
    const { rec, sink } = newSink();
    const res = await runNero("never satisfiable", "e2e-ceiling", sink as any, { approvalMode: false });
    check("caps at 3 attempts (MAX_REFLECTIONS=2)", res.attempts === 3, res.attempts);
    check("terminal phase is failed", rec.statuses.at(-1)?.phase === "failed", rec.statuses.at(-1));
    check("only 2 reflections stored (not 3)", rec.reflections.length === 2, rec.reflections.length);
    check("failed run STILL returns best answer", res.answer === "still wrong", res.answer);
    check("critic's caveat is available to the UI", res.verdict?.pass === false && res.verdict!.critique.length > 0, res.verdict?.critique);
  }

  // ══ SCENARIO 4: provider crash mid-run ═══════════════════════════
  console.log("\nSCENARIO 4 — provider blows up mid-run");
  {
    attemptOf = { planner: 0, critic: 0 }; calls.length = 0;
    script = {
      plan: () => PLAN("go", "none"),
      exec: () => { throw new Error("429 rate_limit_exceeded from provider"); },
      verdict: () => VERDICT(90, true, "ok", ""),
    };
    const { rec, sink } = newSink();
    const res = await runNero("crash me", "e2e-crash", sink as any, { approvalMode: false });
    check("run does not throw — returns cleanly", typeof res.answer === "string");
    check("terminal phase is failed", rec.statuses.at(-1)?.phase === "failed", rec.statuses.at(-1));
    check("real provider error surfaced to the user", /rate_limit_exceeded/.test(rec.statuses.at(-1)?.message ?? ""), rec.statuses.at(-1)?.message);
    check("metrics still flushed after crash", rec.metrics !== null);
  }

  // ══ SCENARIO 5: HITL denial inside a real run ════════════════════
  console.log("\nSCENARIO 5 — SAFE MODE denial mid-run");
  {
    const { decide } = await import("@/lib/approvals");
    attemptOf = { planner: 0, critic: 0 }; calls.length = 0;
    script = {
      plan: () => PLAN("run code", "run_js"),
      exec: (_a, step) => step === 0
        ? toolCallStream("run_js", { code: "1+1" })
        : textStream("I could not run code because it was denied.", 60, 12),
      verdict: () => VERDICT(75, true, "adapted to the denial", ""),
    };
    const { rec, sink } = newSink();
    const runP = runNero("run some code", "e2e-hitl", sink as any, { approvalMode: true });

    // Wait for the approval card, then DENY over the side channel.
    const t0 = Date.now();
    while (rec.approvals.length === 0 && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 100));
    check("approval card emitted for run_js", rec.approvals[0]?.toolName === "run_js" && rec.approvals[0]?.status === "pending", rec.approvals[0]);
    check("run is genuinely blocked (no tool result yet)", !rec.tools.some((t: any) => t.status === "done"), rec.tools);

    const accepted = await decide(rec.approvals[0].id, false);
    check("side-channel DENY accepted", accepted === true);

    const res = await runP;
    check("run resumed and completed after the verdict", rec.statuses.at(-1)?.phase === "done", rec.statuses.at(-1));
    check("card reconciled to denied under the SAME id", rec.approvals.length === 2 && rec.approvals[1].id === rec.approvals[0].id && rec.approvals[1].status === "denied", rec.approvals.map((a: any) => a.status));
    check("run_js never really executed", !rec.tools.some((t: any) => t.output?.ok === true), rec.tools.map((t: any) => t.output));
    check("agent received a structured denial it could adapt to", /DENIED by the human operator/.test(JSON.stringify(rec.tools.at(-1)?.output)), rec.tools.at(-1)?.output);
    check("final answer reflects the denial", /denied/i.test(res.answer), res.answer);
  }

  console.log(`\n${"─".repeat(52)}`);
  console.log(`E2E: ${pass} passed, ${fail} failed`);
  if (fail) console.log(`failures: ${fails.join(", ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(1); });
