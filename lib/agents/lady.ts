import { generateObject } from "ai";
import { resolveModel } from "@/lib/providers";
import { VerdictSchema, type Verdict, type Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";

/**
 * Recover a valid verdict object from schema-prepended output.
 *
 * Some models — notably Groq's openai/gpt-oss-120b — emit the JSON *schema*
 * concatenated in front of the actual object (`{"$schema":…}{"criteria":…}`),
 * i.e. two top-level objects, which is invalid JSON and fails generateObject's
 * parse (`json_validate_failed`). Without this, a correct answer's run crashes
 * before LADY can judge, killing the verdict, StyleRank, and Reflexion retry.
 *
 * Recovery: scan for balanced top-level `{…}` groups (string/escape aware) and
 * return the last one that parses AND isn't merely a `$schema` wrapper. This
 * runs ONLY when the normal parse fails, so it is inert for well-behaved
 * providers (Anthropic/OpenAI/Google emit a single clean object).
 */
export function repairSchemaPrependedJson(text: string): string | null {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0) {
      if (--depth === 0 && start >= 0) {
        groups.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (let i = groups.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(groups[i]) as Record<string, unknown>;
      const keys = Object.keys(parsed);
      if (keys.length && !(keys.length <= 2 && "$schema" in parsed)) {
        return groups[i];
      }
    } catch {
      // not valid on its own — keep scanning earlier groups
    }
  }
  return null;
}

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
    // Defend against models that prepend the schema (see helper above).
    experimental_repairText: async ({ text }) => repairSchemaPrependedJson(text),
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
