import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { runNero, type OrchestratorSink } from "@/lib/agents/orchestrator";
import { trish } from "@/lib/memory/trish";
import { activeProvider, isProviderId, type AgentRole } from "@/lib/providers";
import { isKnownModel } from "@/lib/model-catalog";
import type { RunConfig } from "@/lib/run-context";
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

  // BYOK: optional per-request keys from the console's key vault.
  // Used for this request only — never stored, never logged.
  const providerHeader = req.headers.get("x-nero-provider")?.toLowerCase();
  const provider =
    providerHeader && isProviderId(providerHeader) ? providerHeader : undefined;

  // Per-role model picks from the Command Deck. Validate each against the
  // effective provider's allow-list — an unknown id is dropped so the role
  // falls back to the server default. An arbitrary client string never
  // reaches a provider.
  const effectiveProvider = provider ?? activeProvider();
  const models: Partial<Record<AgentRole, string>> = {};
  for (const role of ["planner", "executor", "critic"] as const) {
    const picked = req.headers.get(`x-nero-${role}-model`);
    if (picked && isKnownModel(effectiveProvider, picked)) models[role] = picked;
  }

  const config: RunConfig = {
    provider,
    apiKey: req.headers.get("x-nero-api-key") ?? undefined,
    tavilyKey: req.headers.get("x-nero-tavily-key") ?? undefined,
    models: Object.keys(models).length ? models : undefined,
    approvalMode: req.headers.get("x-nero-approval") !== "off",
  };

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
        approval: (id, data) =>
          writer.write({ type: "data-approval", id, data }),
        span: (id, data) => writer.write({ type: "data-span", id, data }),
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

      await runNero(goal, sessionId, sink, config);

      if (textOpen) {
        writer.write({ type: "text-end", id: textId });
      }
    },
    onFinish: ({ messages }) => {
      // Replay snapshot: the run becomes a shareable permalink at
      // /run/<sessionId>. Fire-and-forget; replay is a nice-to-have.
      void trish.saveReplay(sessionId, messages).catch(() => {});
    },
    onError: (error) => {
      console.error("[nero] run failed:", error);
      const detail =
        error instanceof Error ? error.message : String(error ?? "unknown");
      return `Run failed: ${detail.slice(0, 400)} — if this mentions a key, open KEYS; if it mentions rate limits or request size, the provider throttled the run (free tiers are tight) — retry, simplify the mission, or switch provider in KEYS.`;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
