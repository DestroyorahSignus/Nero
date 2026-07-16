import { z } from "zod";

/** VERGIL's output. generateObject enforces this shape — no prose plans. */
export const PlanSchema = z.object({
  strategy: z
    .string()
    .describe("One-sentence strategy for how to accomplish the goal"),
  steps: z
    .array(
      z.object({
        title: z.string().describe("Short imperative step title"),
        toolHint: z
          .enum([
            "web_search",
            "web_fetch",
            "run_js",
            "csv_describe",
            "csv_aggregate",
            "none",
          ])
          .describe("Most likely tool for this step, or 'none' for pure reasoning"),
        successCriteria: z
          .string()
          .describe("Concrete, checkable condition that means this step succeeded"),
      }),
    )
    .min(1)
    .max(6)
    .describe("Ordered, minimal set of steps. Fewer is better."),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * LADY's output. Rubric-driven judgment — the external verification signal
 * that makes reflection actually work (intrinsic self-correction without
 * one can degrade results; Huang et al., ICLR 2024).
 */
export const VerdictSchema = z.object({
  criteria: z
    .array(
      z.object({
        name: z.enum(["task_completion", "tool_usage", "grounding"]),
        score: z.number().min(0).max(100),
        justification: z.string(),
      }),
    )
    .length(3),
  overallScore: z.number().min(0).max(100),
  pass: z
    .boolean()
    .describe("true only if the answer genuinely accomplishes the user's goal"),
  critique: z
    .string()
    .describe("The single most important flaw, or why it passed"),
  reflection: z
    .string()
    .describe(
      "Actionable advice to the executor for the next attempt: what to do differently, which tool to use, what to verify. Empty string if pass.",
    ),
});
export type Verdict = z.infer<typeof VerdictSchema>;
