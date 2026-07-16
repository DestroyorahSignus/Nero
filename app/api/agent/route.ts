import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { runNero, type OrchestratorSink } from "@/lib/agents/orchestrator";
import type { NeroUIMessage } from "@/ai/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby-safe; raise to 800 on Vercel Pro

/**
 * POST /api/agent
 * Body: useChat payload — the latest user message text is the goal.
 * Streams typed data-* parts (plan, agent-step, tool-call, verdict,
 * reflection, metrics, run-status) plus the final answer as text.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    messages: NeroUIMessage[];
  };

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  const goal = lastUser?.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

  if (!goal) {
    return Response.json({ error: "No goal provided" }, { status: 400 });
  }

  const sessionId = body.id ?? crypto.randomUUID();

  const stream = createUIMessageStream<NeroUIMessage>({
    originalMessages: body.messages,
    execute: async ({ writer }) => {
      let textId = crypto.randomUUID();
      let textOpen = false;

      const sink: OrchestratorSink = {
        plan: (id, data) => writer.write({ type: "data-plan", id, data }),
        agentStep: (id, data) =>
          writer.write({ type: "data-agent-step", id, data }),
        toolCall: (id, data) =>
          writer.write({ type: "data-tool-call", id, data }),
        verdict: (id, data) => writer.write({ type: "data-verdict", id, data }),
        reflection: (id, data) =>
          writer.write({ type: "data-reflection", id, data }),
        metrics: (data) =>
          writer.write({ type: "data-metrics", id: "metrics", data }),
        status: (data) =>
          writer.write({ type: "data-run-status", id: "run-status", data }),
        textDelta: (delta) => {
          if (!textOpen) {
            writer.write({ type: "text-start", id: textId });
            textOpen = true;
          }
          writer.write({ type: "text-delta", id: textId, delta });
        },
        resetText: () => {
          if (textOpen) {
            writer.write({ type: "text-end", id: textId });
            textOpen = false;
          }
          textId = crypto.randomUUID();
        },
      };

      await runNero(goal, sessionId, sink);

      if (textOpen) {
        writer.write({ type: "text-end", id: textId });
      }
    },
    onError: (error) => {
      console.error("[nero] run failed:", error);
      return "The run failed. Check server logs and provider API keys.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
