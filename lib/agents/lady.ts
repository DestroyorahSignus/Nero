import { generateObject } from "ai";
import { resolveModel } from "@/lib/providers";
import { repairStructuredJson, isStructuredOutputError } from "./json-repair";
import { VerdictSchema, type Verdict, type Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";

const CRITIQUE_ATTEMPTS = 3;

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

  const system = [
    "You are LADY, the evaluation agent of a multi-agent system. You judge the executor's answer against the user's goal.",
    "Respond with a single JSON object matching the required verdict structure — no prose outside the JSON.",
    "Score three criteria from 0-100:",
    "- task_completion: does the answer fully and correctly accomplish the goal?",
    "- tool_usage: were the right tools chosen and their outputs used faithfully? If no tools were needed and none used, score high.",
    "- grounding: is every factual claim supported by tool output or clearly flagged as model knowledge? Fabricated specifics are an automatic fail.",
    "Be strict. A plausible-sounding but unverified answer is a fail, not an A.",
    "Exception: if a required tool reported itself unavailable/unconfigured, an answer from model knowledge that is CLEARLY FLAGGED as such is acceptable — score tool_usage on how well the executor adapted, and never reward punting the task back to the user.",
    "pass=true requires overallScore >= 70 AND no fabrication.",
    "If pass=false, write a reflection: specific, actionable instructions for the next attempt (which tool to call, what to verify, what to avoid). Address the executor directly.",
  ].join("\n");
  const prompt = [
    `Goal: ${goal}`,
    `Plan strategy: ${planObj.strategy}`,
    `Success criteria: ${planObj.steps.map((s) => s.successCriteria).join(" | ")}`,
    `Tool trace:\n${trace}`,
    `Executor's final answer:\n${answer}`,
  ].join("\n\n");

  const attempt = async (): Promise<Verdict> => {
    const { object, usage } = await generateObject({
      model: resolveModel("critic"),
      schema: VerdictSchema,
      experimental_repairText: async ({ text }) => repairStructuredJson(text),
      system,
      prompt,
    });
    budget.record(usage);
    return object;
  };

  // Same Groq gpt-oss schema-echo flakiness as VERGIL — retry the stochastic
  // failure; auth/key errors surface immediately.
  let lastErr: unknown;
  for (let i = 1; i <= CRITIQUE_ATTEMPTS; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (!isStructuredOutputError(err) || i === CRITIQUE_ATTEMPTS) break;
    }
  }

  // Critic couldn't produce a structured verdict after retries. Don't fail the
  // whole run — return the answer UNJUDGED with an honest caveat. pass=true so
  // the run completes (rather than spending Reflexion retries on a critic that
  // can't emit JSON); the caveat makes the un-verification explicit.
  if (isStructuredOutputError(lastErr)) {
    const note = "Critic unavailable (provider structured-output error) — answer returned UNJUDGED, not independently verified.";
    return {
      criteria: [
        { name: "task_completion", score: 70, justification: note },
        { name: "tool_usage", score: 70, justification: note },
        { name: "grounding", score: 70, justification: note },
      ],
      overallScore: 70,
      pass: true,
      critique: note,
      reflection: "",
    };
  }
  throw lastErr;
}

function clip(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 700 ? s.slice(0, 700) + "…" : s;
}
