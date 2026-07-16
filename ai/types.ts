import type { UIMessage } from "ai";

/** DMC-style rank derived from the critic score. The signature of NERO's UI. */
export type StyleRank = "D" | "C" | "B" | "A" | "S" | "SS" | "SSS";

export type AgentName = "VERGIL" | "NERO" | "LADY" | "TRISH" | "YAMATO";
export type StepStatus = "pending" | "running" | "done" | "failed";

export interface PlanStepData {
  index: number;
  title: string;
  toolHint: string | null;
  successCriteria: string;
  status: StepStatus;
}

export interface PlanData {
  goal: string;
  strategy: string;
  steps: PlanStepData[];
  attempt: number;
}

export interface AgentStepData {
  agent: AgentName;
  label: string;
  status: StepStatus;
  detail?: string;
  attempt: number;
}

export interface ToolCallData {
  callId: string;
  toolName: string;
  status: "running" | "done" | "failed";
  input: unknown;
  output?: unknown;
  latencyMs?: number;
  attempt: number;
  stepIndex: number | null;
}

export interface ReflectionData {
  attempt: number;
  critique: string;
  reflection: string;
}

export interface VerdictData {
  attempt: number;
  score: number;
  rank: StyleRank;
  pass: boolean;
  critique: string;
  criteria: { name: string; score: number }[];
}

export interface MetricsData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estCostUsd: number;
  elapsedMs: number;
  llmCalls: number;
  toolCalls: number;
  budgetTokens: number;
}

export interface RunStatusData {
  phase:
    | "planning"
    | "executing"
    | "critiquing"
    | "reflecting"
    | "done"
    | "failed"
    | "budget_exceeded";
  message: string;
}

/**
 * Every custom `data-*` part NERO streams to the client.
 * Reusing an `id` when writing reconciles the part in place,
 * which is how the live graph/timeline animates.
 */
export type NeroDataParts = {
  plan: PlanData;
  "agent-step": AgentStepData;
  "tool-call": ToolCallData;
  reflection: ReflectionData;
  verdict: VerdictData;
  metrics: MetricsData;
  "run-status": RunStatusData;
};

export type NeroUIMessage = UIMessage<never, NeroDataParts>;

export function scoreToRank(score: number): StyleRank {
  if (score >= 97) return "SSS";
  if (score >= 90) return "SS";
  if (score >= 80) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}
