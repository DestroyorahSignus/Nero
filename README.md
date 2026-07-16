<div align="center">

# NERO

**Neural Executive & Reasoning Orchestrator**

An MCP-orchestrated planner → executor → critic multi-agent system with
Reflexion self-correction, hard cost guardrails, and a live agent-graph console.

`Next.js 16` · `Vercel AI SDK v7` · `Model Context Protocol` · `React Flow` · `Upstash Redis`

</div>

---

## Why this exists

Tool-calling is table stakes. The hard parts of agentic systems are **bounded loops,
recovery from bad tool output, and measurement** — so NERO makes them the product:

- **Schema-validated everything** — the plan (`generateObject` + Zod), every tool input
  (`inputSchema`), and the critic's verdict are structured objects, never free prose.
- **Self-correction with an external signal** — a rubric-driven LLM-as-judge (LADY) produces
  verbal reflections that are stored (TRISH) and injected into the retry. This is deliberate:
  intrinsic self-correction without external feedback can *degrade* results
  (Huang et al., ICLR 2024). Reflexion-style loops work when the signal is real
  (Shinn et al., NeurIPS 2023).
- **Hard guardrails** — a per-run token budget (default 150k) and attempt ceiling (3).
  A public agent demo without a budget is a donation to your LLM provider.
- **Real MCP** — the arsenal is exposed as a genuine Streamable-HTTP MCP server at
  `/api/mcp/mcp`. Point Claude Desktop or Cursor at your deployment and use the same tools.
- **Measured** — a 20-task eval suite with programmatic ground-truth checks and a
  `--bare` executor-only ablation, so the loop's lift is a number.

## The crew

| Agent | Role | Mechanism |
|---|---|---|
| **VERGIL** | Planner | `generateObject` → Zod `PlanSchema`: steps with tool hints + checkable success criteria |
| **NERO** | Executor | `ToolLoopAgent`, `stopWhen: stepCountIs(12)`, streams every tool call |
| **LADY** | Critic | LLM-as-judge rubric: task_completion / tool_usage / grounding; fails unverified answers |
| **TRISH** | Memory | Upstash Redis: reflections (working, 1h TTL) + run records (long-term) |
| **YAMATO** | MCP gateway | `local` in-process ToolSet or `remote` MCP client against `/api/mcp` |

**Arsenal (MCP servers):** BLUE ROSE `web_search`/`web_fetch` · NICO `run_js`
(vm-isolated, 2s cap — demo-grade; swap for Vercel Sandbox/E2B in production) ·
KALINA ANN `csv_describe`/`csv_aggregate`.

## Quickstart

```bash
npm install
cp .env.example .env.local        # set LLM_PROVIDER + that provider's API key
npm run dev                        # http://localhost:3000 → OPEN THE CONSOLE
```

Everything else is optional: without Tavily the search tool degrades honestly,
without Upstash memory falls back in-process for dev.

## Evals (run these, put the numbers here)

```bash
npm run evals -- --bare   # ablation: bare executor
npm run evals             # full loop: plan + critique + reflexion
```

| Configuration | Task completion | Mean tokens/run |
|---|---|---|
| Bare executor | _run it_ | _run it_ |
| Full NERO loop | _run it_ | _run it_ |

## Deploy

1. Push to GitHub → import in Vercel (Fluid Compute is default-on; `vercel.json` sets `maxDuration: 800`).
2. Set `LLM_PROVIDER` + the matching API key. Optionally add Upstash + Tavily.
3. To demo the full MCP round-trip set `YAMATO_MODE=remote` and `NERO_SELF_URL=https://<your-app>`.

Switching providers is one env var — `anthropic | openai | google | groq` — with
per-role model overrides via `NERO_PLANNER_MODEL` / `NERO_EXECUTOR_MODEL` / `NERO_CRITIC_MODEL`.

## Repo map

```
app/api/agent/route.ts          streaming orchestrator endpoint (typed data-* parts)
app/api/mcp/[transport]/        the arsenal as a real MCP server (mcp-handler)
app/run/page.tsx                live console: React Flow graph · trace · metrics · style rank
lib/agents/{vergil,nero,lady,orchestrator}.ts
lib/mcp/yamato.ts               dual-mode tool gateway
lib/memory/trish.ts             Redis memory w/ dev fallback
lib/tools/                      the arsenal (single source of truth)
lib/evals/                      REBELLION: 20 tasks + ablation runner
PLAN.md                         the build plan this repo was executed from
```

## Design notes

The console's signature is the **style rank**: LADY's 0–100 verdict rendered as a
Devil May Cry rank (D → SSS). Palette is "Devil Trigger" — void black-blue with a
spectral cyan accent; Chakra Petch display over IBM Plex. Reduced motion respected.
