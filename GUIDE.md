# NERO — The Complete Guide (plain-text edition)

Neural Executive & Reasoning Orchestrator.

This is the read-anywhere version of ARCHITECTURE.md — every diagram is plain
ASCII, so it renders in any text editor, notes app, or phone screen. Same
depth, zero dependency on GitHub's Mermaid rendering.

---

## 1. The 30-second picture

NERO takes a goal, PLANS it into schema-validated steps, EXECUTES the plan
with real tools over the Model Context Protocol, JUDGES its own answer with
a rubric-driven LLM critic, and — if the judgment fails — RETRIES with a
stored reflection about what went wrong. Every state transition streams to
a live console. The whole loop runs under a hard token budget and an attempt
ceiling, so it can never spiral.

```
                 ┌──────────────────────────────────┐
                 │            reflection            │
                 ▼                                  │
  goal ──► VERGIL ──► NERO ──► LADY ──┬── pass ──► answer
           (plans)   (executes) (judges)│
                                        └── fail ──► TRISH (remembers)
```

The thesis: tool-calling is table stakes. The product here is the hard
parts — bounded loops, recovery from bad tool output, honest measurement.

---

## 2. Full system map

```
┌─────────────────────────  BROWSER (/run console)  ─────────────────────────┐
│  useChat + DefaultChatTransport                                            │
│  ┌───────────────┐ ┌──────────────┐ ┌───────────┐ ┌─────────┐ ┌─────────┐  │
│  │ agent graph   │ │ trace        │ │ style     │ │ metrics │ │ mission │  │
│  │ (React Flow)  │ │ timeline     │ │ rank D→SSS│ │ + burn  │ │ log     │  │
│  └───────────────┘ └──────────────┘ └───────────┘ └─────────┘ └─────────┘  │
└──────────────▲──────────────────────────────────────────────▲──────────────┘
               │ SSE: data-* parts + text                     │ GET
┌──────────────┴──────────────  NEXT.JS API  ─────────────────┴──────────────┐
│  /api/agent (streaming orchestrator)      /api/status   /api/runs          │
│  /api/mcp/[transport] (real MCP server via mcp-handler)                    │
└──────┬──────────────────────────────────────────────────────────────▲──────┘
       │                                                              │
┌──────▼───────────────────  ORCHESTRATION CORE (lib/)  ──────────────┴──────┐
│  orchestrator.ts — the Reflexion loop                                      │
│  vergil.ts (planner)   nero.ts (executor)   lady.ts (critic)               │
│  budget.ts (TokenBudget)   trish.ts (memory)   yamato.ts (MCP gateway)     │
└──────┬────────────────────────────────────────────┬────────────────────────┘
       │ local mode (in-process)                    │ remote mode (MCP/HTTP)
┌──────▼────────────────────────────────────────────▼────────────────────────┐
│  THE ARSENAL (lib/tools/) — defined ONCE, exposed both ways                 │
│  BLUE ROSE: web_search, web_fetch │ NICO: run_js │ KALINA ANN: csv tools    │
└──────┬───────────────────────┬──────────────────────────────┬──────────────┘
       ▼                       ▼                              ▼
  LLM provider            Tavily search                 Upstash Redis
  (anthropic/openai/      (optional)                    (optional)
   google/groq)
```

Three properties worth noticing:

- Tools are defined exactly once (lib/tools/) and consumed two ways:
  in-process by the executor, and over the wire as a genuine MCP server.
- The orchestrator is UI-agnostic. It emits events through a sink
  interface — the same loop powers the web console and the CLI eval harness.
- Every external dependency is optional. No Tavily key → search degrades
  honestly. No Redis → in-memory fallback. Switch providers with one env var.

---

## 3. Lifecycle of a run

```
 Browser          /api/agent        Orchestrator      Agents & services
    │                  │                  │
    │ POST {messages}  │                  │
    ├─────────────────►│  runNero(goal)   │
    │  (SSE opens      ├─────────────────►│
    │   immediately)   │                  │── getReflections ──► TRISH
    │                  │                  │◄─ [] (first attempt)
    │                  │                  │
    │                  │                  │── plan(goal) ──────► VERGIL
    │◄── data-plan ────┤◄─────────────────│◄─ Plan {strategy, steps 1–6}
    │                  │                  │
    │                  │                  │── execute(plan) ───► NERO
    │                  │                  │      │ tool loop ≤12 steps
    │◄── data-tool-call┤◄─────────────────│      ├──► YAMATO ──► tool
    │    (run → done)  │                  │      │◄── result ◄──┘
    │◄── text deltas ──┤◄─────────────────│◄─ {answer, toolCallCount}
    │                  │                  │
    │                  │                  │── critique(...) ───► LADY
    │◄── data-verdict ─┤◄─────────────────│◄─ Verdict {score, pass, reflection}
    │                  │                  │
    │                  │          pass? ──┤── yes ─► saveRun ─► TRISH, done
    │◄── data-status ──┤                  └── no ──► addReflection ─► TRISH
    │                  │                            loop back to VERGIL
```

Key detail: the HTTP response starts streaming BEFORE any model call —
serverless platforms kill silent functions, and the user sees the plan
materialize live instead of staring at a spinner.

---

## 4. The agents

Design follows Anthropic's "Building Effective Agents" guidance: simple,
composable patterns over frameworks. Each agent is a small file with one job
and one structured output.

### 4.1 VERGIL — planner
File: lib/agents/vergil.ts · Primitive: streamObject + Zod PlanSchema

Decomposes the goal into an ordered, minimal set of steps — then steps back.
Never executes anything.

```
 goal + tool catalog + prior reflections
                │
                ▼
     streamObject (schema-constrained decoding, streamed fragments)
                │
                ▼
     Plan ── strategy: one sentence
          └─ steps 1–6, each with:
               · title
               · toolHint  (enum of REAL tool names, or "none")
               · successCriteria (concrete + checkable)
```

Why schema-validated planning matters:

- streamObject constrains output to PlanSchema — the plan CANNOT be
  malformed prose. The partial stream is forwarded live, so the plan
  checklist MATERIALIZES step by step; the final object is still fully
  schema-validated before execution.
- toolHint is a Zod enum of actual tool names. The planner physically
  cannot plan around a tool that doesn't exist — a hallucination class
  deleted at the type level.
- Every step requires a concrete success criterion ("the exact integer is
  stated", not "the answer is good"). LADY judges against these later.
- Plans are capped at 1–3 steps unless genuinely necessary. Over-
  decomposition = more tokens = more places to go wrong.
- On retries, reflections are injected into the planning prompt — a failed
  run doesn't just retry harder, it RE-PLANS differently.

### 4.2 NERO — executor
File: lib/agents/nero.ts · Primitive: ToolLoopAgent

The tactical workhorse. Receives the plan as instructions and runs the AI
SDK's production tool loop:

```
 ┌──────────────────────────────────────────────┐
 │  LLM call (with tools) ◄────────────┐        │
 │       │                             │        │
 │       ├── tool call requested       │        │
 │       │      │                      │        │
 │       │      ▼                      │        │
 │       │   execute via YAMATO        │        │
 │       │      │  (emit running/done  │        │
 │       │      │   + latency to UI)   │        │
 │       │      ▼                      │        │
 │       │   result appended ──────────┘        │
 │       │                                      │
 │       └── final text ──► stream deltas       │
 │                                              │
 │  hard stop: stopWhen stepCountIs(12)         │
 └──────────────────────────────────────────────┘
```

Details that matter:

- stopWhen: stepCountIs(12) — the first of THREE nested loop bounds
  (steps → attempts → tokens).
- Lifecycle callbacks capture every tool invocation with wall-clock
  latency, feeding both the live UI and the trace LADY will judge.
- Instructions encode epistemic rules, not just the plan: "a tool
  returning ok:false is a signal to adapt, not to invent data"; "never
  fabricate URLs, numbers or search results".
- The executor can be a cheaper model than planner/critic
  (NERO_EXECUTOR_MODEL) — tool orchestration is the mechanical role.

### 4.3 LADY — critic
File: lib/agents/lady.ts · Primitive: generateObject + Zod VerdictSchema

The external verification signal. Sees the goal, the plan's success
criteria, the COMPLETE tool trace (inputs + outputs), and the final answer.
Scores three axes 0–100:

```
 task_completion │ does the answer fully, correctly accomplish the goal?
 tool_usage      │ right tools chosen? outputs used faithfully?
 grounding       │ every claim backed by tool output, or flagged as
                 │ model knowledge? fabricated specifics = automatic fail
                 ▼
 Verdict ── criteria scores ×3
         ├─ overallScore 0–100  ──►  rank D/C/B/A/S/SS/SSS
         ├─ pass  (score ≥ 70 AND no fabrication)
         ├─ critique   (the single most important flaw)
         └─ reflection (actionable advice for the next attempt)
```

Why this is the load-bearing component: research shows LLMs largely cannot
self-correct reasoning without external feedback — naive "try again, but
better" loops can make answers WORSE (Huang et al., ICLR 2024,
arXiv:2310.01798). Reflexion-style self-correction works when the
reflection is grounded in a real verification signal (Shinn et al.,
NeurIPS 2023, arXiv:2303.11366). LADY is that signal:

- Judges against the plan's OWN success criteria — the contract VERGIL wrote.
- Reads the actual tool trace, so "the answer says 42 but no tool ever
  produced 42" is a catchable grounding failure.
- Rubric states explicitly: a plausible-sounding but unverified answer is
  a FAIL, not an A. The anti-sycophancy clause.
- The D→SSS rank is presentation; the pass gate is the real contract.

### 4.4 TRISH — memory
File: lib/memory/trish.ts · Backend: Upstash Redis, in-process Map fallback

```
 WORKING MEMORY (per session, 1h TTL)      LONG-TERM MEMORY (durable)
 ┌─────────────────────────────────┐      ┌─────────────────────────────┐
 │ nero:reflections:{sessionId}    │      │ nero:runs (last 100)        │
 │ last ≤5 reflections             │      │ goal, score, rank, attempts,│
 └───────────▲─────────┬───────────┘      │ tokens, cost, latency       │
             │         │                  └──────────────▲──────────────┘
   LADY fail─┘         └─► injected into        run ends─┘
   (addReflection)         next attempt's            (saveRun)
                           planner+executor              │
                           prompts                       ▼
                                                  GET /api/runs
                                                  → Mission log panel
```

Design choices:

- Reflections capped at 5 per session — memory hygiene is part of the
  Reflexion recipe; unbounded reflections bloat and poison prompts.
- 1-hour TTL — reflections are advice about THIS goal, not durable facts.
- The fallback is honest: without Redis, memory survives only while the
  serverless instance is warm, and the console's MEMORY: VOLATILE chip
  says so. The system never pretends to be more durable than it is.

---

## 5. The Reflexion loop (state machine)

```
            ┌────────────────────────────────────────────────┐
            │              attempt += 1, reflections          │
            ▼                                                 │
 [*] ─► PLANNING ─► EXECUTING ─► CRITIQUING ─┬─ pass ─► DONE  │
            │            │            │      │                │
            │            │            │      ├─ fail + attempts left
            │            │            │      │        └─► REFLECTING ─┘
            │            │            │      └─ fail + exhausted ─► FAILED
            │            │            │
            └────────────┴────────────┴── budget.exceeded ─► BUDGET_EXCEEDED

 DONE / FAILED / BUDGET_EXCEEDED  ──►  saveRun to TRISH  ──►  [*]
```

Three deliberate behaviors:

1. Budget is checked after EVERY phase, not just per attempt — a run can
   stop mid-loop the moment it crosses the cap.
2. Failure still returns the answer — the best answer ships WITH LADY's
   critique attached as a visible caveat. More honest than an error page.
3. The reflection reshapes the next attempt at BOTH levels: VERGIL
   re-plans with it, NERO executes with it.

---

## 6. YAMATO — the MCP gateway
File: lib/mcp/yamato.ts

The executor never imports tools directly — it asks YAMATO for a ToolSet.
Two modes, switched by YAMATO_MODE:

```
                    ┌── local (default) ──► in-process registry
                    │                       zero latency, zero hops
 NERO ──► YAMATO ───┤
                    └── remote ──► createMCPClient (@ai-sdk/mcp)
                                        │ JSON-RPC over Streamable HTTP
                                        ▼
                                   /api/mcp/mcp
                                   createMcpHandler (mcp-handler)
                                        │
                                        ▼
                                   same arsenal
```

Why dual-mode instead of picking one:

- LOCAL is the correct engineering default when agent and tools ship in
  the same deployment — adding an HTTP hop to call your own process is
  architecture theater.
- REMOTE proves the protocol is real: flip one env var and the same run
  flows through a genuine MCP client → server round-trip. The MCP server
  is independently useful — point Claude Desktop or Cursor at
  https://<your-app>/api/mcp/mcp and they get NERO's arsenal.
- The route exports GET, POST **and** DELETE — initialize arrives over
  POST, stream reads over GET; export only POST and clients see empty
  capabilities (a real-world gotcha).
- Every tool ships MCP spec annotations (readOnlyHint, destructiveHint,
  idempotentHint, openWorldHint). Per the spec these are HINTS — NERO
  never trusts them for enforcement; that lives in withApprovalGate.

---

## 7. The arsenal (tool servers)

Every tool: Zod inputSchema (validates every call the model makes) and
structured {ok: true|false} results — errors are DATA the agent reasons
about, never exceptions that kill the run.

### BLUE ROSE — web reconnaissance (lib/tools/blue-rose.ts)

```
 web_search ──► TAVILY_API_KEY set? ──┬─ yes ─► Tavily ─► ok:true, results
                                      └─ no ──► ok:false + an error message
                                               that EXPLAINS the situation
                                               and suggests alternatives
 web_fetch ──► 12s timeout ─► strip scripts/styles/tags ─► truncate 8k chars
```

The unconfigured-search path is the interesting part: instead of throwing
or hallucinating, the tool returns a structured explanation the model can
route around. Honest degradation is a feature. Fetched text also returns
FENCED as untrusted data (<<<UNTRUSTED_WEB_CONTENT>>> sentinels + notice)
— layer one of the injection defense in section 8.

### NICO — code sandbox (lib/tools/nico.ts)

```
 agent JS (≤6k chars) ──► node:vm context
                            · no require, no process, no fetch
                            · code-gen from strings/wasm disabled
                            · 2s hard timeout
                          ──► ok:true  {console.log lines + final value}
                          ──► ok:false {error name + message}
```

Honest-by-design: node:vm is NOT a security boundary against a determined
adversary, and the code says so. Demo-grade isolation with a documented
upgrade path (Vercel Sandbox / E2B) behind the same tool interface.
Knowing where your sandbox's guarantees end is the senior-level signal.

### KALINA ANN — data analysis (lib/tools/kalina-ann.ts)

Pure TypeScript CSV analytics — quote-aware parser, csv_describe
(type inference, min/max/mean/median/stddev), csv_aggregate (group-by
with sum/mean/count/min/max).

Why pure TS instead of "run pandas in the sandbox": deterministic tools
give LADY something exact to verify against. When the aggregation is
computed by real code, "does the answer match the tool output" is a crisp
grounding check.

---

## 8. Guardrails — three nested loop bounds

```
 Level 1 · STEPS     stopWhen stepCountIs(12)        bounds one execution
 Level 2 · ATTEMPTS  NERO_MAX_REFLECTIONS=2 (→3 max) bounds the Reflexion loop
 Level 3 · TOKENS    TokenBudget, default 150k,      bounds the entire run
                     checked after every phase        in cost terms
```

TokenBudget (lib/budget.ts) accumulates usage from EVERY LLM call —
planner, executor, critic, every attempt. The cost estimate uses a
deliberately conservative flat rate ($3/M in, $15/M out) so the dashboard
number is an upper bound, not marketing.

Why non-negotiable: Reflexion-style loops cost roughly 10–30× a single
pass. A public demo without a hard cap is an open invitation to drain your
API account. When the budget trips, the run ends gracefully with
budget_exceeded and returns the best answer so far.

### 8.1 The human-in-the-loop gate
Files: lib/approvals.ts · app/api/approve/route.ts · ApprovalCard.tsx

SAFE MODE (on by default; header toggle) gates run_js behind a live
operator verdict. The run STAYS ALIVE while the tool blocks on a decision
arriving over a side channel:

```
 NERO calls run_js
      │
      ▼
 withApprovalGate ──► store: open(id)=pending
      │                       ▲
      ├─► data-approval ──►  Browser renders ApprovalCard
      │   (pending)              │ ALLOW / DENY
      │                          ▼
      │                  POST /api/approve {id, approved}
      │                          │
      │  execute() polls ◄───────┘ (Redis carries it across instances)
      ▼
 approved ──► run the real execute()
 denied /
 90s timeout ─► structured ok:false error — agent adapts, run continues
      │
      └─► data-approval (final status, same id — card reconciles in place)
```

Properties worth defending in an interview: FAILS CLOSED (no verdict in
90s = deny); a denial is a structured tool error the agent reasons about,
not a crash; enforcement sits at the YAMATO gateway so web content or a
jailbroken plan can never reach code execution without a human; double
decides and unknown ids are rejected. Why not the AI SDK's native
toolApproval re-send flow: NERO's Reflexion loop runs server-side in ONE
stream — pausing and re-POSTing the conversation would dismantle the
state machine. The side channel keeps it intact.

### 8.2 Prompt-injection defense

OWASP's #1 LLM risk, two editions running; no cure, only defense in depth.
Two layers: (1) DATA FENCING — web_fetch output is wrapped in
UNTRUSTED_WEB_CONTENT sentinels + a security notice, and the executor's
instructions declare fenced content is data that can never issue
instructions, change the goal, or request tools; (2) CAPABILITY
MINIMIZATION — even a successful injection cannot reach run_js without
passing the human gate above. Layer one makes steering unlikely; layer
two bounds the blast radius when it happens.

---

## 9. Streaming architecture

The orchestrator emits events through a SINK interface; the API route
implements the sink as typed UI-message-stream writes; the client derives
its ENTIRE state from the message parts.

```
 orchestrator ──sink──► /api/agent ──writer.write({type:'data-*',id,data})──►
   SSE ──► useChat<NeroUIMessage> ──► one useMemo over message.parts ──►
   graph · trace · rank · metrics · plan
```

The typed data-part vocabulary (ai/types.ts):

```
 part               carries                              id strategy
 ─────────────────  ───────────────────────────────────  ─────────────────
 data-plan          strategy + steps + attempt           plan-{attempt}
 data-agent-step    agent, label, status, detail         {agent}-{attempt}
 data-tool-call     name, input, output, latency, status tool-{callId}
 data-reflection    critique + reflection text           reflection-{attempt}
 data-verdict       score, rank, pass, criteria          verdict-{attempt}
 data-approval      tool, input, pending/approved/       approval-{uuid}
                    denied/timeout
 data-span          phase label, start+duration ms,      span-{role}-{attempt}
                    tokens
 data-metrics       tokens, cost, latency, budget        "metrics" (fixed)
 data-run-status    phase + human message                "run-status" (fixed)
```

Three mechanisms doing the heavy lifting:

1. ID-based reconciliation — writing a part with an existing id UPDATES it
   in place. A tool call is written once as "running" and again as "done"
   with the same id, so the UI row and graph node animate through states
   instead of duplicating.
2. Fresh text part per attempt — sink.resetText() closes the current text
   part before each attempt, so a retry's answer never concatenates onto
   the failed one. The client renders the LAST text part.
3. Full-stack type safety — NeroUIMessage = UIMessage<never, NeroDataParts>
   means the server cannot write a part shape the client doesn't know.

### 9.1 Shareable run replay
Files: app/run/[sessionId]/page.tsx · ReplayConsole.tsx · lib/derive.ts

The console is pure derived state, so replay is nearly free:

```
 run finishes ──onFinish──► TRISH (nero:replay:{id}, 7-day TTL)
                                │
 /run/{id} permalink ──────────►│
                                ▼
                    deriveConsoleState  ◄── the SAME fold the live
                                │           console uses
                                ▼
                    ReplayConsole (read-only, REPLAY badge)
```

Every demo becomes a link: run once, share the URL, a recruiter watches
the full trace — graph, spans, rank slam — at zero token cost. Mission
log rows link to their replays. Deliberately NOT implemented: live
resumable streams (heavier machinery; the reference pattern re-attaches
streams without auth). A snapshot has none of those problems.

---

## 10. The console UI

Design system ("Devil Trigger"): void #0a0d14 · panel #101623 · spectral
cyan #5ee1ff (Nero's Devil Trigger) · crimson #e1364c (critic/fail) ·
ember #f2b94b (planner) · arcane violet #9d7bff (memory). Type: Chakra
Petch (display) / IBM Plex Sans (body) / IBM Plex Mono (data). The
geometry is angular corner cuts everywhere — a two-layer clip-path trick
(CutPanel), because clip-path eats real CSS borders.

```
 ┌── header ────────────────────────────────────────────────────────┐
 │ NERO▮   chips: LLM · YAMATO · SEARCH · MEMORY        ● LIVE      │
 │ PLAN ──────────── EXECUTE ──────────── JUDGE   (phase tracker)   │
 ├── mission briefing ──────────────────────────────────[ DEPLOY ]──┤
 ├───────────────────────────────────────┬──────────────────────────┤
 │  AGENT GRAPH — LIVE                   │  STYLE RANK  (D → SSS)   │
 │  (React Flow: crew + tool nodes,      │  rank slam + ladder      │
 │   pulsing edges while running)        ├──────────────────────────┤
 ├───────────────────────────────────────┤  COMBO METER             │
 │  TRACE (expandable tool in/out)       ├──────────────────────────┤
 ├───────────────────────────────────────┤  METRICS + budget burn   │
 │  FINAL ANSWER (streams token by       ├──────────────────────────┤
 │  token; LADY's caveat if failed)      │  VERGIL'S PLAN checklist │
 │                                       ├──────────────────────────┤
 │  [ApprovalCard slides in here when   │  SPAN WATERFALL          │
 │   SAFE MODE pauses a run_js call]     │  (phase × ms × tokens)   │
 │                                       ├──────────────────────────┤
 │                                       │  MISSION LOG — TRISH     │
 │                                       │  (rows link to replays)  │
 └───────────────────────────────────────┴──────────────────────────┘
```

- Everything is derived state — one useMemo folds message.parts into the
  console state. Re-render and the UI rebuilds identically from the parts.
- The signature element is the STYLE RANK: LADY's 0–100 verdict slams in
  as a DMC rank (D→SSS) with the ladder lighting up beneath it. Theming
  that visualizes the eval, not decoration.
- The combo meter is honest theater — it visualizes real event throughput
  (each streamed part lands a hit; inactivity bleeds it down).
- Accessibility floor: prefers-reduced-motion disables every animation,
  focus states visible, progress bars carry ARIA attributes.

---

## 11. REBELLION — the eval suite
Files: lib/evals/suite.ts, lib/evals/run.ts

Twenty tasks, each with a PROGRAMMATIC ground-truth check on the final
answer — the lift from self-correction is measured against reality.

```
 category   n   exercises          example
 ─────────  ─   ─────────────────  ─────────────────────────────────────
 compute    7   NICO sandbox       digit sum of 2^100 → must contain 115
 data       5   KALINA ANN         top region by revenue → West + 30,500
 reasoning  4   tool RESTRAINT     bat-and-ball → 5 cents (intuition trap)
 web        4   BLUE ROSE          fetch example.com → "Example Domain"
```

The ablation is the point:

```
 npm run evals -- --bare   bare executor (no plan, no critic, no retry)
 npm run evals             full loop (VERGIL + NERO + LADY + Reflexion)
                                  │
                                  ▼
              same 20 programmatic checks
                                  │
                                  ▼
        completion-rate delta = the measured value of the architecture
```

- The reasoning category is adversarial in the other direction — questions
  where eager tool use or pattern-matched intuition gets the wrong answer.
  It tests that the loop doesn't OVER-engage.
- Checks are regex/substring against ground truth — no LLM grades the eval
  that validates the LLM loop (avoids circular judging).
- Publish BOTH numbers. The ablation baseline is what makes the headline
  credible.

---

## 12. Provider abstraction
File: lib/providers.ts

```
 resolveModel(role) ──► NERO_{ROLE}_MODEL set? ──┬─ yes ─► exact model id
                                                 └─ no ──► defaults table
                                │
                        LLM_PROVIDER env var
                ┌───────────┬────────────┬───────────┐
            anthropic     openai       google       groq
```

- One env var swaps the entire backend; the AI SDK's unified LanguageModel
  interface means zero code changes.
- Per-role resolution encodes a real principle: the critic should never be
  weaker than the worker — a judge that misses what the executor missed
  produces reflections that make things worse.
- Env overrides isolate the codebase from provider model-id churn.

---

## 13. Deployment topology (Vercel)

```
 Browser ──► static shells (/ and /run)
         ──► SSE ──► /api/agent          (Node runtime, maxDuration 300)
 Claude Desktop / Cursor ──Streamable HTTP──► /api/mcp/[transport]
 /api/agent ──► LLM provider API
            ──► Upstash Redis (optional; also MCP session resumption)
```

- Node runtime everywhere — node:vm, mcp-handler, and long durations all
  rule out Edge (25s hard cap).
- maxDuration ships at 300 (works on every plan); raise to 800 on Pro.
- Early streaming is a survival mechanism: the response begins before the
  first model call so the platform never kills a "silent" function.
- Minimum viable deployment = two env vars: LLM_PROVIDER + one API key.

---

## 14. Design decisions & trade-offs

```
 decision                        why this way
 ──────────────────────────────  ─────────────────────────────────────────
 hand-built loop on raw AI SDK   frameworks obscure prompts/control flow;
 (not LangGraph/Mastra/CrewAI)   building the loop demonstrates you
                                 understand what's under the abstraction

 external LLM-as-judge critic    intrinsic self-critique without external
 (not "review your answer")      signal can DEGRADE performance; the
                                 rubric + trace + criteria judge is a
                                 genuine external signal

 tools defined once,             one source of truth; divergence between
 dual-exposed (in-proc + MCP)    "agent tools" and "MCP tools" is a bug
                                 class deleted

 node:vm sandbox, loudly         right-sized for a demo; the honest
 documented limits               limitation + identical-interface upgrade
                                 path is worth more than silent complexity

 structured ok:false errors      an exception kills the run; a structured
 (not thrown exceptions)         error is context the model routes around

 fresh text part per attempt     a retry's answer must REPLACE the failed
                                 attempt's answer, not concatenate

 conservative flat-rate cost     a simple honest upper bound beats a
                                 precise number that goes stale

 programmatic eval checks        the harness validating the LLM loop
 (not LLM-graded)                shouldn't itself be an LLM opinion

 side-channel HITL approval      the Reflexion loop runs server-side in
 (not toolApproval re-send)      one stream; re-POSTing the conversation
                                 would dismantle the state machine

 snapshot replay                 reuses the derived-state fold, costs
 (not resumable live streams)    nothing to view; the resumable pattern
                                 couples to after() and re-attaches
                                 streams without auth — scoped out

 custom span waterfall           the spans NERO needs are four fields;
 (not full OpenTelemetry)        @ai-sdk/otel + Langfuse is the
                                 documented upgrade path
```

---

## 15. File-by-file map

```
nero/
├── PLAN.md                    the build plan this repo was executed from
├── ARCHITECTURE.md            deep-dive with Mermaid diagrams (GitHub)
├── GUIDE.md                   this file — reads anywhere
├── README.md                  quickstart, crew table, eval table, deploy
├── vercel.json                maxDuration 300 for app/api/**
├── .env.example               the full configuration surface
│
├── ai/types.ts                NeroDataParts, NeroUIMessage, scoreToRank
│
├── lib/
│   ├── approvals.ts           HITL gate: broker, store, withApprovalGate
│   ├── derive.ts              parts → console state (live + replay)
│   ├── providers.ts           LLM_PROVIDER switch + per-role models
│   ├── budget.ts              TokenBudget hard cap + MAX_REFLECTIONS
│   ├── agents/
│   │   ├── schemas.ts         PlanSchema + VerdictSchema (Zod)
│   │   ├── vergil.ts          planner  — generateObject
│   │   ├── nero.ts            executor — ToolLoopAgent + callbacks
│   │   ├── lady.ts            critic   — rubric LLM-as-judge
│   │   └── orchestrator.ts    the Reflexion state machine + sink
│   ├── mcp/yamato.ts          dual-mode tool gateway
│   ├── memory/trish.ts        reflections + run log (Redis/fallback)
│   ├── tools/
│   │   ├── registry.ts        ARSENAL — single source of truth
│   │   ├── blue-rose.ts       web_search + web_fetch
│   │   ├── nico.ts            run_js — vm sandbox, 2s cap
│   │   └── kalina-ann.ts      csv_describe + csv_aggregate
│   └── evals/
│       ├── suite.ts           20 tasks × programmatic checks
│       └── run.ts             CLI: full loop vs --bare ablation
│
├── app/
│   ├── layout.tsx             fonts + shell
│   ├── globals.css            Devil Trigger tokens, cuts, animations
│   ├── page.tsx               landing: glitch hero, crew, arsenal
│   ├── run/page.tsx           the console — state derived from parts
│   ├── run/[sessionId]/       shareable replay permalink
│   └── api/
│       ├── agent/route.ts     streaming orchestrator (+ replay snapshot)
│       ├── approve/route.ts   human side of the HITL gate
│       ├── mcp/[transport]/route.ts   the arsenal as a real MCP server
│       ├── status/route.ts    deployment config for header chips
│       └── runs/route.ts      TRISH's mission log
│
└── components/
    ├── ui/CutPanel.tsx        two-layer clip-path corner-cut panel
    ├── graph/AgentGraph.tsx   React Flow crew + tool nodes
    └── console/
        ├── StyleRank.tsx      the signature: D→SSS rank slam + ladder
        ├── PhaseTracker.tsx   PLAN → EXECUTE → JUDGE stepper
        ├── ComboMeter.tsx     event-throughput gauge, DMC style
        ├── ApprovalCard.tsx   mid-run ALLOW / DENY card
        ├── SpanWaterfall.tsx  per-phase latency + token bars
        ├── ReplayConsole.tsx  read-only replay console
        ├── TraceTimeline.tsx  expandable step/tool/reflection log
        ├── MetricsPanel.tsx   tokens · cost · latency · budget burn
        ├── PlanChecklist.tsx  VERGIL's plan as a mission checklist
        └── RunHistory.tsx     TRISH's long-term memory, ranked
```

---

Built as a portfolio piece. The interesting parts are the boring parts:
the budget that stops the loop, the critic that refuses to be impressed,
and the eval suite that tells you whether any of it actually helped.
