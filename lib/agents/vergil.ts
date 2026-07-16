import { streamObject } from "ai";
import { resolveModel } from "@/lib/providers";
import { PlanSchema, type Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";
import type { StoredReflection } from "@/lib/memory/trish";
import { TOOL_META } from "@/lib/tools/registry";

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
  const toolCatalog = Object.entries(TOOL_META)
    .map(([name, meta]) => `- ${name} (${meta.server}): ${meta.blurb}`)
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
      "- Never plan steps for capabilities that do not exist in the tool list.",
    ].join("\n"),
    prompt: `Goal: ${goal}${reflectionBlock}`,
  });

  // The plan checklist fills in live as schema-conformant fragments stream.
  for await (const partial of result.partialObjectStream) {
    onPartial?.(partial);
  }

  const object = await result.object; // fully validated against PlanSchema
  budget.record(await result.usage);
  return object;
}
