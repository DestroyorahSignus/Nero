import { generateObject } from "ai";
import { resolveModel } from "@/lib/providers";
import { VerdictSchema, type Verdict, type Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";

/**
 * LADY — critic. No demonic powers: pure external judgment.
 * Rubric-driven LLM-as-judge over three axes (mirroring MCP-Bench):
 * task completion, tool usage rationale, grounding. Produces the verbal
 * reflection that TRISH stores and the next attempt consumes.
 */
export async function critique(
  goal: string,
  planObj: Plan,
  answer: string,
  toolTrace: { toolName: string; input: unknown; output: unknown }[],
  budget: TokenBudget,
): Promise<Verdict> {
  const trace =
    toolTrace.length > 0
      ? toolTrace
          .map(
            (t, i) =>
              `${i + 1}. ${t.toolName}\n   input: ${clip(t.input)}\n   output: ${clip(t.output)}`,
          )
          .join("\n")
      : "(no tools were called)";

  const { object, usage } = await generateObject({
    model: resolveModel("critic"),
    schema: VerdictSchema,
    system: [
      "You are LADY, the evaluation agent of a multi-agent system. You judge the executor's answer against the user's goal.",
      "Score three criteria from 0-100:",
      "- task_completion: does the answer fully and correctly accomplish the goal?",
      "- tool_usage: were the right tools chosen and their outputs used faithfully? If no tools were needed and none used, score high.",
      "- grounding: is every factual claim supported by tool output or clearly flagged as model knowledge? Fabricated specifics are an automatic fail.",
      "Be strict. A plausible-sounding but unverified answer is a fail, not an A.",
      "Exception: if a required tool reported itself unavailable/unconfigured, an answer from model knowledge that is CLEARLY FLAGGED as such is acceptable — score tool_usage on how well the executor adapted, and never reward punting the task back to the user.",
      "pass=true requires overallScore >= 70 AND no fabrication.",
      "If pass=false, write a reflection: specific, actionable instructions for the next attempt (which tool to call, what to verify, what to avoid). Address the executor directly.",
    ].join("\n"),
    prompt: [
      `Goal: ${goal}`,
      `Plan strategy: ${planObj.strategy}`,
      `Success criteria: ${planObj.steps.map((s) => s.successCriteria).join(" | ")}`,
      `Tool trace:\n${trace}`,
      `Executor's final answer:\n${answer}`,
    ].join("\n\n"),
  });
  budget.record(usage);
  return object;
}

function clip(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 700 ? s.slice(0, 700) + "…" : s;
}
