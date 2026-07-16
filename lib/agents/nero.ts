import { ToolLoopAgent, stepCountIs, type ToolSet } from "ai";
import { resolveModel } from "@/lib/providers";
import type { Plan } from "./schemas";
import type { TokenBudget } from "@/lib/budget";
import type { StoredReflection } from "@/lib/memory/trish";

/**
 * NERO — executor. The tactical workhorse: a ToolLoopAgent that carries out
 * VERGIL's plan with the arsenal YAMATO provides, streaming every tool
 * execution to the caller via callbacks.
 */
export interface ExecutorEvents {
  onToolStart: (info: {
    callId: string;
    toolName: string;
    input: unknown;
  }) => void;
  onToolEnd: (info: {
    callId: string;
    toolName: string;
    output: unknown;
    latencyMs: number;
  }) => void;
  onTextDelta: (delta: string) => void;
}

export async function execute(
  goal: string,
  planObj: Plan,
  tools: ToolSet,
  budget: TokenBudget,
  reflections: StoredReflection[],
  events: ExecutorEvents,
): Promise<{ text: string; toolCallCount: number }> {
  const started = new Map<string, number>();
  let toolCallCount = 0;

  const reflectionBlock =
    reflections.length > 0
      ? `\n\nYour previous attempt(s) at this goal FAILED review. Apply these reflections:\n${reflections
          .map((r) => `- ${r.reflection}`)
          .join("\n")}`
      : "";

  const agent = new ToolLoopAgent({
    model: resolveModel("executor"),
    tools,
    stopWhen: stepCountIs(12),
    instructions: [
      "You are NERO, the execution agent of a multi-agent system.",
      "Carry out the plan below step by step using the available tools, then produce the final answer for the user.",
      "Rules:",
      "- Verify tool outputs before trusting them; a tool returning ok:false is a signal to adapt, not to invent data.",
      "- Ground every factual claim in tool output when tools were used; never fabricate URLs, numbers or search results.",
      "- Be concise in the final answer. Answer the goal directly.",
      `Plan strategy: ${planObj.strategy}`,
      "Plan steps:",
      ...planObj.steps.map(
        (s, i) =>
          `${i + 1}. ${s.title} (tool: ${s.toolHint}; success: ${s.successCriteria})`,
      ),
    ].join("\n"),
  });

  const result = await agent.stream({
    prompt: `Goal: ${goal}${reflectionBlock}`,
    onToolExecutionStart: ({ toolCall }) => {
      started.set(toolCall.toolCallId, Date.now());
      toolCallCount += 1;
      events.onToolStart({
        callId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    },
    onToolExecutionEnd: ({ toolCall, toolOutput }) => {
      const t0 = started.get(toolCall.toolCallId) ?? Date.now();
      const output =
        toolOutput.type === "tool-result"
          ? toolOutput.output
          : { ok: false, error: String(toolOutput.error) };
      events.onToolEnd({
        callId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output,
        latencyMs: Date.now() - t0,
      });
    },
  });

  for await (const delta of result.textStream) {
    events.onTextDelta(delta);
  }

  budget.record(await result.totalUsage);
  const text = await result.text;
  return { text, toolCallCount };
}
