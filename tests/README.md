# tests/ — key-free test suites

Every suite here runs with **no API key, no Tavily key, and no Redis**. Real
tools execute, the real orchestrator runs, the real MCP protocol round-trips —
only the LLM itself is simulated.

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| `units.ts` | `npm run test:units` | nothing | Deterministic tools (NICO, KALINA ANN, BLUE ROSE), `scoreToRank`, `TokenBudget`, `deriveConsoleState`, the HITL gate, eval-suite integrity |
| `e2e-mock.ts` | `npm run test:e2e` | nothing | The **whole orchestrator**: Reflexion retry, budget wall, attempt ceiling, provider crash, SAFE MODE denial |
| `live.ts` | `npm run test:live` | a running server | HTTP surface + a real MCP client → Streamable HTTP → tools round trip |

`npm test` runs the two that need no server.

## Running the live suite

```bash
npm run build && npx next start -p 3111 &
PORT=3111 npm run test:live
```

## How the LLM is faked (`e2e-mock.ts`)

`runNero` and the three agents are **not** modified. `MockLanguageModelV4` from
`ai/test` is substituted for the real model by intercepting the module load of
`lib/providers.ts` — the injection lives entirely in the test file, so no test
seam exists in production code.

Consequences worth knowing:

- Tool calls are **real**. When the mock executor asks for `run_js`, NICO
  actually runs the code, so `102334155` in the assertions is computed, not
  stubbed.
- Everything except model *quality* is under test: the state machine, the
  sink/stream parts, budget accounting, spans, memory, and the approval gate.
- What these suites **cannot** tell you is whether real models plan, execute,
  and judge well. That is what `npm run evals` measures, and it needs a key.

## Regression guards worth keeping

Three assertions exist because they caught real bugs (see `SESSIONS.md`,
2026-07-23):

- `units.ts` → *"require blocked AND real error surfaced"* — guards against the
  sandbox swallowing error details across the vm realm boundary.
- `live.ts` → *"keyless run TERMINATES (no infinite hang)"* — guards the
  planner's provider-failure path, which used to hang forever.
- `e2e-mock.ts` → *"real provider error surfaced to the user"* — guards the
  executor's equivalent path.
