import { streamObject } from "ai";
import { resolveModel } from "@/lib/providers";
import { PlanSchema, type Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";
import type { StoredReflection } from "@/lib/memory/trish";
import { TOOL_META } from "@/lib/tools/registry";
import { runConfig } from "@/lib/run-context";

/**
 * VERGIL — planner. Cold, strategic, then steps back.
 * Decomposes the goal into a schema-validated plan and does not execute.
 * On retry attempts, prior reflections reshape the plan.
 */
export async function plan(
  goal: string,
  budget: TokenBudget,
  reflections: StoredReflection[],
  onPartial?: (partial: unknown) => void,
): Promise<Plan> {
  const searchArmed = Boolean(runConfig().tavilyKey ?? process.env.TAVILY_API_KEY);
  const toolCatalog = Object.entries(TOOL_META)
    .map(([name, meta]) => {
      const offline = name === "web_search" && !searchArmed;
      return `- ${name} (${meta.server}): ${meta.blurb}${offline ? " — OFFLINE on this deployment: do NOT plan this tool" : ""}`;
    })
    .join("\n");

  const reflectionBlock =
    reflections.length > 0
      ? `\n\nPrevious attempts failed. Reflections from the critic (weigh these heavily):\n${reflections
          .map((r) => `Attempt ${r.attempt}: ${r.reflection}`)
          .join("\n")}`
      : "";

  const result = streamObject({
    model: resolveModel("planner"),
    schema: PlanSchema,
    system: [
      "You are VERGIL, the planning agent of the NERO multi-agent system.",
      "Decompose the user's goal into the smallest ordered set of steps that will accomplish it.",
      "Each step needs a concrete, checkable success criterion — vague criteria are a planning failure.",
      "Available tools:",
      toolCatalog,
      "Rules:",
      "- Prefer 1-3 steps. Only exceed 3 when the goal genuinely requires it.",
      "- If the goal is answerable without tools, plan a single 'none' step.",
      "- Tool restraint: explanations, diagrams, flowcharts, writing, and general-knowledge tasks need NO tools — plan 'none'. Reserve web_search for current events or facts you genuinely cannot know, and never plan more than one search step.",
      "- Never plan steps for capabilities that do not exist in the tool list, and never plan tools marked OFFLINE — plan around them (own knowledge or other tools).",
    ].join("\n"),
    prompt: `Goal: ${goal}${reflectionBlock}`,
  });

  // The plan checklist fills in live as schema-conformant fragments stream.
  //
  // Consume fullStream, not partialObjectStream: on a provider failure (missing
  // or rejected key, rate limit, outage) the partial stream simply ends and
  // `await result.object` NEVER SETTLES — the run would hang forever with the
  // console frozen on "VERGIL is planning". The error arrives as a stream part,
  // so surface it and let the orchestrator report the truth.
  let streamError: unknown = null;
  try {
    for await (const part of result.fullStream) {
      if (part.type === "object") onPartial?.(part.object);
      else if (part.type === "error") streamError = part.error;
    }
  } catch (err) {
    throw streamError ?? err;
  }
  if (streamError) throw streamError;

  const object = await result.object; // fully validated against PlanSchema
  budget.record(await result.usage);
  return object;
}
