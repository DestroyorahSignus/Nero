import type {
  NeroUIMessage,
  PlanData,
  AgentStepData,
  ToolCallData,
  ReflectionData,
  VerdictData,
  MetricsData,
  RunStatusData,
  ApprovalData,
  SpanData,
} from "@/ai/types";

export type TraceEntry =
  | { kind: "agent"; key: string; data: AgentStepData }
  | { kind: "tool"; key: string; data: ToolCallData }
  | { kind: "reflection"; key: string; data: ReflectionData };

export interface ConsoleState {
  plan: PlanData | null;
  agentSteps: AgentStepData[];
  toolCalls: ToolCallData[];
  approvals: { id: string; data: ApprovalData }[];
  spans: SpanData[];
  verdict: VerdictData | null;
  metrics: MetricsData | null;
  runStatus: RunStatusData | null;
  trace: TraceEntry[];
  finalText: string;
  eventCount: number;
}

/**
 * Fold an assistant message's parts into the full console state.
 * Pure and order-respecting: the SAME function drives the live console and
 * the replay permalink — replay is just this fold over persisted parts.
 */
export function deriveConsoleState(
  messages: NeroUIMessage[],
): ConsoleState {
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");

  let plan: PlanData | null = null;
  const agentSteps = new Map<string, AgentStepData>();
  const toolCalls = new Map<string, ToolCallData>();
  const reflections = new Map<string, ReflectionData>();
  const approvals = new Map<string, ApprovalData>();
  const spans = new Map<string, SpanData>();
  let verdict: VerdictData | null = null;
  let metrics: MetricsData | null = null;
  let runStatus: RunStatusData | null = null;
  const trace: TraceEntry[] = [];
  let finalText = "";
  let eventCount = 0;

  const upsertTrace = (entry: TraceEntry) => {
    const idx = trace.findIndex((t) => t.key === entry.key);
    if (idx >= 0) trace[idx] = entry;
    else trace.push(entry);
  };

  for (const part of assistant?.parts ?? []) {
    switch (part.type) {
      case "data-plan":
        plan = part.data;
        eventCount += 1;
        break;
      case "data-agent-step": {
        const key = part.id ?? crypto.randomUUID();
        upsertTrace({ kind: "agent", key, data: part.data });
        agentSteps.set(key, part.data);
        eventCount += 1;
        break;
      }
      case "data-tool-call": {
        const key = part.id ?? part.data.callId;
        upsertTrace({ kind: "tool", key, data: part.data });
        toolCalls.set(key, part.data);
        eventCount += 1;
        break;
      }
      case "data-reflection": {
        const key = part.id ?? `r-${part.data.attempt}`;
        if (!reflections.has(key)) {
          trace.push({ kind: "reflection", key, data: part.data });
        }
        reflections.set(key, part.data);
        eventCount += 1;
        break;
      }
      case "data-approval": {
        const key = part.id ?? crypto.randomUUID();
        approvals.set(key, part.data);
        eventCount += 1;
        break;
      }
      case "data-span": {
        const key = part.id ?? crypto.randomUUID();
        spans.set(key, part.data);
        eventCount += 1;
        break;
      }
      case "data-verdict":
        verdict = part.data;
        eventCount += 1;
        break;
      case "data-metrics":
        metrics = part.data;
        break;
      case "data-run-status":
        runStatus = part.data;
        break;
      case "text":
        finalText = part.text; // last text part wins (fresh per attempt)
        eventCount += 1;
        break;
    }
  }

  return {
    plan,
    agentSteps: [...agentSteps.values()],
    toolCalls: [...toolCalls.values()],
    approvals: [...approvals.entries()].map(([id, data]) => ({ id, data })),
    spans: [...spans.values()].sort((a, b) => a.startMs - b.startMs),
    verdict,
    metrics,
    runStatus,
    trace,
    finalText,
    eventCount,
  };
}

/** The executor sometimes emits markdown emphasis; the console renders plain text. */
export function stripMdLite(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*\S)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}
