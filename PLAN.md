# NERO — Build Plan

> Neural Executive & Reasoning Orchestrator. The plan this repo was built from.
> Portfolio gap it fills: **agentic orchestration** — MCP, planner→executor→critic,
> schema-validated function calling, Reflexion self-correction, observability.

## Thesis

The differentiator for AI Engineer portfolios in 2026 is not tool use (table
stakes) but the hard parts: preventing infinite loops, recovering from bad tool
output, and **measuring** accuracy. NERO makes those hard parts the product:
a bounded Reflexion loop, an external-signal critic, a live trace UI, and a
20-task eval suite with an ablation baseline.

## Architecture

```
                 ┌────────────── YAMATO (MCP gateway) ──────────────┐
                 │  local mode: in-process ToolSet                  │
                 │  remote mode: MCP client → /api/mcp (Streamable  │
                 │  HTTP, mcp-handler) — same arsenal, real protocol│
                 └───────────────────────┬──────────────────────────┘
                                         │ tools
 goal ──► VERGIL (planner) ──► NERO (executor, ToolLoopAgent) ──► LADY (critic, LLM-as-judge)
              ▲   generateObject            streams every            generateObject rubric:
              │   PlanSchema (Zod)          tool call live           task_completion / tool_usage / grounding
              │                                                        │
              └────────── TRISH (memory: reflections, Upstash) ◄─ fail┘
                                     retry ≤ NERO_MAX_REFLECTIONS, capped by TokenBudget
```

- **VERGIL** `lib/agents/vergil.ts` — `generateObject` + `PlanSchema`. Plans, never executes.
- **NERO** `lib/agents/nero.ts` — `ToolLoopAgent` (`stopWhen: stepCountIs(12)`), per-tool-call callbacks.
- **LADY** `lib/agents/lady.ts` — rubric judge. Why external: intrinsic self-correction can *degrade*
  results (Huang et al., ICLR 2024, arXiv:2310.01798); Reflexion works when reflections come from a
  verification signal (Shinn et al., NeurIPS 2023, arXiv:2303.11366).
- **TRISH** `lib/memory/trish.ts` — Upstash Redis (in-memory fallback for dev). Working memory =
  reflections (1h TTL, capped at 5); long-term = run records.
- **YAMATO** `lib/mcp/yamato.ts` — dual-mode tool gateway. Tools defined **once** in `lib/tools/*`,
  consumed in-process AND exposed as a genuine MCP server (`app/api/mcp/[transport]/route.ts`).
- **REBELLION** `lib/evals/` — 20 tasks × programmatic ground-truth checks; `--bare` flag runs the
  executor-only ablation so the self-correction lift is a measured number, not a vibe.
- **Arsenal**: BLUE ROSE (web_search/web_fetch), NICO (run_js sandbox), KALINA ANN (csv tools).

## Guardrails (the production-maturity signal)

- `TokenBudget` — hard total-token cap per run (`NERO_TOKEN_BUDGET`, default 150k). Reflexion loops
  cost 10–30× a single pass; the budget makes the public demo unbankruptable.
- Attempt ceiling `NERO_MAX_REFLECTIONS` (default 2 → max 3 attempts).
- Every tool returns structured `{ok:false,error}` instead of throwing — bad tool output is a signal
  the agent reasons about, not a crash.
- NICO is honest about isolation: `node:vm` + frozen context + 2s timeout is demo-grade; swap in
  Vercel Sandbox/E2B for hostile inputs (interface unchanged).

## Streaming design

`POST /api/agent` → `createUIMessageStream` with typed custom parts (`ai/types.ts`):
`data-plan · data-agent-step · data-tool-call · data-reflection · data-verdict · data-metrics ·
data-run-status` + text parts for the answer (fresh text part per attempt via `resetText`).
Parts reuse stable `id`s so the client reconciles them in place → the graph animates.

Client: `useChat<NeroUIMessage>` + `DefaultChatTransport`; the entire console is derived state
from the last assistant message's parts. React Flow (`@xyflow/react`) renders the crew graph;
verdicts land as a DMC style rank (D→SSS) — the signature UI element.

## Deployment (Vercel)

- Node runtime, `maxDuration = 800` (vercel.json) — requires Fluid Compute (default-on).
- `LLM_PROVIDER` swaps anthropic/openai/google/groq with zero code change (`lib/providers.ts`);
  per-role model overrides via `NERO_*_MODEL`.
- Optional: `TAVILY_API_KEY` (search), `UPSTASH_REDIS_*` (durable memory), `REDIS_URL`
  (MCP session resumption), `YAMATO_MODE=remote` (full MCP round-trip).

## Phases (as executed)

- **P0** eval suite first (`lib/evals/suite.ts`) — can't measure lift without it
- **P1** provider layer + arsenal + executor + streaming route
- **P2** planner + critic + Reflexion via TRISH + budget guardrails
- **P3** live console: React Flow graph, trace, metrics, style rank
- **P4** MCP server route (mcp-handler), README, eval runner with ablation

## Post-ship checklist

- [ ] `npm run evals -- --bare` then `npm run evals` → put both numbers in README
- [ ] Deploy to Vercel, connect Upstash, set one provider key
- [ ] Point Claude Desktop at `https://<app>/api/mcp/mcp` and screenshot it
- [ ] 3-minute demo video; lead the README with the completion-rate delta
