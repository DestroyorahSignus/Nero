import { plan as vergilPlan } from "./vergil";
import { execute as neroExecute } from "./nero";
import { critique as ladyCritique } from "./lady";
import { drawYamato } from "@/lib/mcp/yamato";
import { trish } from "@/lib/memory/trish";
import { TokenBudget, MAX_REFLECTIONS } from "@/lib/budget";
import { withRunConfig, runConfig, type RunConfig } from "@/lib/run-context";
import { ApprovalBroker, withApprovalGate } from "@/lib/approvals";
import { scoreToRank } from "@/ai/types";
import type {
  PlanData,
  AgentStepData,
  ToolCallData,
  VerdictData,
  ReflectionData,
  MetricsData,
  RunStatusData,
  ApprovalData,
  SpanData,
} from "@/ai/types";
import type { Verdict } from "./schemas";

/**
 * The NERO run loop:
 *
 *   VERGIL plan → NERO execute (tools via YAMATO) → LADY critique
 *        ▲                                              │
 *        └── TRISH stores reflection ◄── fail ──────────┘
 *
 * Bounded by a hard token budget and MAX_REFLECTIONS attempts. Emits every
 * state transition through an event sink so the same orchestrator powers
 * both the streaming UI and the CLI eval harness.
 */
export interface OrchestratorSink {
  plan: (id: string, data: PlanData) => void;
  agentStep: (id: string, data: AgentStepData) => void;
  toolCall: (id: string, data: ToolCallData) => void;
  verdict: (id: string, data: VerdictData) => void;
  reflection: (id: string, data: ReflectionData) => void;
  metrics: (data: MetricsData) => void;
  status: (data: RunStatusData) => void;
  approval: (id: string, data: ApprovalData) => void;
  span: (id: string, data: SpanData) => void;
  textDelta: (delta: string) => void;
  /** Close the current text part; the next delta opens a fresh one (per attempt). */
  resetText: () => void;
}

export interface RunResult {
  answer: string;
  verdict: Verdict | null;
  attempts: number;
  budget: TokenBudget;
  elapsedMs: number;
}

export function runNero(
  goal: string,
  sessionId: string,
  sink: OrchestratorSink,
  config: RunConfig = {},
): Promise<RunResult> {
  // BYOK keys ride request-scoped context — never module/global state.
  return withRunConfig(config, () => runNeroInner(goal, sessionId, sink));
}

async function runNeroInner(
  goal: string,
  sessionId: string,
  sink: OrchestratorSink,
): Promise<RunResult> {
  const t0 = Date.now();
  const budget = new TokenBudget();
  let totalToolCalls = 0;

  const pushMetrics = () =>
    sink.metrics({
      inputTokens: budget.inputTokens,
      outputTokens: budget.outputTokens,
      totalTokens: budget.totalTokens,
      estCostUsd: budget.estCostUsd,
      elapsedMs: Date.now() - t0,
      llmCalls: budget.llmCalls,
      toolCalls: totalToolCalls,
      budgetTokens: budget.maxTotalTokens,
    });

  const yamato = await drawYamato();
  let answer = "";
  let verdict: Verdict | null = null;
  let attempt = 0;

  // Observability: wall-clock + token span per agent phase (waterfall UI).
  const span = async <T>(
    label: string,
    role: SpanData["role"],
    fn: () => Promise<T>,
  ): Promise<T> => {
    const startMs = Date.now() - t0;
    const tokensBefore = budget.totalTokens;
    const result = await fn();
    sink.span(`span-${role}-${attempt}`, {
      label,
      role,
      attempt,
      startMs,
      durMs: Date.now() - t0 - startMs,
      tokens: budget.totalTokens - tokensBefore,
    });
    return result;
  };

  // HITL: dangerous tools pause the stream for an operator verdict.
  const broker = new ApprovalBroker(
    (id, data) => sink.approval(id, data),
    () => attempt,
  );
  const gatedTools = withApprovalGate(
    yamato.tools,
    broker,
    runConfig().approvalMode ?? true,
  );

  try {
    while (attempt <= MAX_REFLECTIONS) {
      attempt += 1;
      const reflections = await trish.getReflections(sessionId);

      // ── VERGIL ────────────────────────────────────────────────────
      sink.status({ phase: "planning", message: `VERGIL is planning (attempt ${attempt})` });
      sink.agentStep(`vergil-${attempt}`, {
        agent: "VERGIL",
        label: "Decompose goal",
        status: "running",
        attempt,
      });
      const planAttempt = attempt;
      const planObj = await span("VERGIL plans", "planner", () =>
        vergilPlan(goal, budget, reflections, (partial) => {
          const p = partial as {
            strategy?: string;
            steps?: ({ title?: string; toolHint?: string; successCriteria?: string } | undefined)[];
          };
          sink.plan(`plan-${planAttempt}`, {
            goal,
            strategy: p.strategy ?? "…",
            attempt: planAttempt,
            steps: (p.steps ?? []).flatMap((st, i) =>
              st?.title
                ? [{
                    index: i,
                    title: st.title,
                    toolHint:
                      st.toolHint && st.toolHint !== "none" ? st.toolHint : null,
                    successCriteria: st.successCriteria ?? "…",
                    status: "pending" as const,
                  }]
                : [],
            ),
          });
        }),
      );
      sink.agentStep(`vergil-${attempt}`, {
        agent: "VERGIL",
        label: "Decompose goal",
        status: "done",
        detail: planObj.strategy,
        attempt,
      });
      sink.plan(`plan-${attempt}`, {
        goal,
        strategy: planObj.strategy,
        attempt,
        steps: planObj.steps.map((s, i) => ({
          index: i,
          title: s.title,
          toolHint: s.toolHint === "none" ? null : s.toolHint,
          successCriteria: s.successCriteria,
          status: "pending",
        })),
      });
      pushMetrics();
      if (budget.exceeded) break;

      // ── NERO ──────────────────────────────────────────────────────
      sink.resetText();
      sink.status({ phase: "executing", message: `NERO is executing (attempt ${attempt})` });
      sink.agentStep(`nero-${attempt}`, {
        agent: "NERO",
        label: "Execute plan",
        status: "running",
        attempt,
      });
      const toolTrace: { toolName: string; input: unknown; output: unknown }[] = [];
      const pendingInputs = new Map<string, unknown>();

      const { text, toolCallCount } = await span("NERO executes", "executor", () =>
        neroExecute(
        goal,
        planObj,
        gatedTools,
        budget,
        reflections,
        {
          onToolStart: ({ callId, toolName, input }) => {
            pendingInputs.set(callId, input);
            sink.toolCall(`tool-${callId}`, {
              callId,
              toolName,
              status: "running",
              input,
              attempt,
              stepIndex: null,
            });
          },
          onToolEnd: ({ callId, toolName, output, latencyMs }) => {
            toolTrace.push({
              toolName,
              input: pendingInputs.get(callId),
              output,
            });
            sink.toolCall(`tool-${callId}`, {
              callId,
              toolName,
              status: "done",
              input: pendingInputs.get(callId),
              output,
              latencyMs,
              attempt,
              stepIndex: null,
            });
            pushMetrics();
          },
          onTextDelta: (delta) => sink.textDelta(delta),
        },
      ));
      totalToolCalls += toolCallCount;
      answer = text;
      sink.agentStep(`nero-${attempt}`, {
        agent: "NERO",
        label: "Execute plan",
        status: "done",
        detail: `${toolCallCount} tool call${toolCallCount === 1 ? "" : "s"}`,
        attempt,
      });
      pushMetrics();
      if (budget.exceeded) break;

      // ── LADY ──────────────────────────────────────────────────────
      sink.status({ phase: "critiquing", message: "LADY is judging the answer" });
      sink.agentStep(`lady-${attempt}`, {
        agent: "LADY",
        label: "Judge answer",
        status: "running",
        attempt,
      });
      verdict = await span("LADY judges", "critic", () =>
        ladyCritique(goal, planObj, answer, toolTrace, budget),
      );
      const rank = scoreToRank(verdict.overallScore);
      sink.agentStep(`lady-${attempt}`, {
        agent: "LADY",
        label: "Judge answer",
        status: verdict.pass ? "done" : "failed",
        detail: `${verdict.overallScore}/100 · rank ${rank}`,
        attempt,
      });
      sink.verdict(`verdict-${attempt}`, {
        attempt,
        score: verdict.overallScore,
        rank,
        pass: verdict.pass,
        critique: verdict.critique,
        criteria: verdict.criteria.map((c) => ({ name: c.name, score: c.score })),
      });
      pushMetrics();

      if (verdict.pass || budget.exceeded) break;

      // ── Reflexion: store and retry ───────────────────────────────
      if (attempt <= MAX_REFLECTIONS) {
        sink.status({
          phase: "reflecting",
          message: `TRISH stores the reflection; retrying (${attempt}/${MAX_REFLECTIONS + 1})`,
        });
        const reflection = {
          attempt,
          critique: verdict.critique,
          reflection: verdict.reflection,
          at: Date.now(),
        };
        await trish.addReflection(sessionId, reflection);
        sink.reflection(`reflection-${attempt}`, reflection);
      }
    }
  } finally {
    await yamato.close();
  }

  const elapsedMs = Date.now() - t0;
  const finalPhase: RunStatusData["phase"] = budget.exceeded
    ? "budget_exceeded"
    : verdict?.pass
      ? "done"
      : "failed";
  sink.status({
    phase: finalPhase,
    message:
      finalPhase === "budget_exceeded"
        ? `Token budget (${budget.maxTotalTokens.toLocaleString()}) reached — returning best answer so far`
        : finalPhase === "done"
          ? "Mission accomplished"
          : "Max attempts reached — returning best answer with the critic's caveats",
  });
  pushMetrics();

  await trish.saveRun({
    sessionId,
    goal,
    score: verdict?.overallScore ?? 0,
    rank: verdict ? scoreToRank(verdict.overallScore) : "D",
    attempts: attempt,
    totalTokens: budget.totalTokens,
    estCostUsd: budget.estCostUsd,
    elapsedMs,
    at: Date.now(),
  });

  return { answer, verdict, attempts: attempt, budget, elapsedMs };
}
