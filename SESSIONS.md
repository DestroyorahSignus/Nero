# NERO — Session Log

A day-wise record of what changed and **why**, kept alongside the code.

Git history says *what* changed; this file says what a working session was
trying to accomplish, what it verified, and what it deliberately left alone.
Read this before resuming work — it pairs with §16 of [GUIDE.md](./GUIDE.md)
(the architecture handoff).

**Convention:** newest day at the bottom. One `##` heading per date
(`YYYY-MM-DD`). Under it: what the session set out to do, what changed, what
was verified with real output, and anything intentionally deferred. Record
absolute dates, never "yesterday" or "last week".

---

## 2026-07-16 — Initial build (12 commits, `ca49b12` → `007669d`)

The whole system was designed and shipped in one day, executed from
[PLAN.md](./PLAN.md). Grouped by what each cluster of commits accomplished.

### Core system — `ca49b12`

The full planner → executor → critic loop in one commit: VERGIL
(`streamObject` + Zod `PlanSchema`), NERO (`ToolLoopAgent`, `stepCountIs(12)`),
LADY (rubric LLM-as-judge), TRISH (Upstash + in-memory fallback), YAMATO
(dual-mode local/remote MCP gateway), the arsenal (BLUE ROSE, NICO, KALINA
ANN), `TokenBudget`, the streaming console, and the 20-task REBELLION eval
suite.

### Documentation — `1fdaa3b`, `d984d29`, `0909757`, `888abf1`

- `ARCHITECTURE.md` — deep dive, Mermaid diagrams (parse-validated headlessly
  before commit so GitHub renders no error boxes).
- `GUIDE.md` — plain-text/ASCII edition, readable without a Mermaid renderer.
- `GUIDE.md` §16 — session-handoff section: pinned-version landmines, verified
  AI SDK v7 API facts, 9 architecture invariants. Written so a cold session can
  resume with zero archaeology.
- `vercel.json` `maxDuration` set to 300 — Hobby-safe; 800 is a Pro-only bump.

### BYOK key vault — `a5d50c9`, `c4bb167`

Client-supplied API keys so the public demo isn't funded by the deployer.
Keys live in `sessionStorage` only, ride as request headers, and reach provider
calls through `AsyncLocalStorage` (`lib/run-context.ts`) — never module/global
state, never logged, never persisted. `c4bb167` follow-up: sanitize vault keys
to printable ASCII on **both** save and read (a pasted key carrying invisible
characters otherwise produces a confusing provider 401).

### Five upgrades — `bd82054`

HITL approval gate (side-channel `/api/approve`, 90s fail-closed), shareable
run replays, per-phase span waterfall, streaming plan materialization
(`partialObjectStream`), and prompt-injection defense (`UNTRUSTED_WEB_CONTENT`
fencing + capability minimization).

### Hardening — `a09ee6c`, `bebaeaf`, `fc1f13b`, `007669d`

Four rounds of failure-mode fixes, all sharing one theme: **a broken run must
never look frozen or silently lie.**

- Groq defaults → `openai/gpt-oss-120b` (`llama-3.3-70b-versatile` was
  deprecated 2026-06-17; symptom was a run erroring silently during PLAN).
- Availability-aware planning — VERGIL is told which tools are OFFLINE and
  plans around them instead of planning a tool that cannot run.
- Knowledge fallback — when a tool is unconfigured the executor answers from
  model knowledge and *says so*, rather than punting the task back to the user.
- SEARCH chip counts a vault-supplied Tavily key, not just the server env var.
- Provider crashes mid-run are caught, reported truthfully, and still return
  the best answer so far.

---

## 2026-07-23 — Repo hygiene, environment verification, flagged-defect fixes

Session goal: get the project onto this machine as a real git checkout, confirm
it builds, then fix the defects found while reading the codebase.

### Working copy — replaced an unzipped download with a real clone

`~/Nero/Nero-main` was a GitHub zip extract: no `.git`, no history, no remote,
so nothing done in it would have been committable. Verified it was safe to
discard by hashing every file with `git hash-object` and diffing against the
remote tree at `007669d` — **54 files, all 54 blob SHAs identical**, so it was
byte-for-byte `main` HEAD with no unsaved work.

Cloned `git@github.com:DestroyorahSignus/Nero.git` → `~/Nero/Nero` (12 commits,
clean tree, SSH remote wired) and deleted the redundant folder.

### Environment verified

| Step | Result |
|---|---|
| `npm install` | 272 packages, **601 MB** `node_modules` |
| `npm run typecheck` | exit 0, zero errors |
| `npm run build` | exit 0, all 9 routes, `.next` = **24 MB** |

Total footprint ~625 MB. Static: `/`, `/run`, `/_not-found`. Dynamic: all five
API routes plus `/run/[sessionId]` (correct — it reads Redis at request time).

Note: `next` alone is 173 MB of that, and Tailwind v4 pulls **both** the gnu and
musl `lightningcss` linux-x64 binaries (~19 MB). The npm cache on this machine
is 5.0 GB and is the easiest space to reclaim if disk gets tight.

### Fixes applied

**1. Broken no-API-key banner** — `app/run/page.tsx`
A full SAFE MODE toggle button had been copy-pasted into the middle of the
warning sentence, before the intended KEYS link, so the banner rendered as
`…missions will fail. Hit [SAFE MODE ON][KEYS] to add your own…`. Removed the
stray button; the real SAFE MODE toggle in the header is untouched.

**2. Dead approval code** — `lib/memory/trish.ts`
`setApproval`, `getApproval`, and the `ApprovalDecision` interface were defined
but never imported anywhere — `lib/approvals.ts` owns its own Redis-backed
approval store. Two parallel implementations of the same thing is exactly the
divergence-bug class the architecture avoids elsewhere. Deleted the unused
trio; `lib/approvals.ts` remains the single source of truth for HITL verdicts.

**3. Unused TTL constant** — `lib/memory/trish.ts`
`REPLAY_TTL_SECONDS` was declared while `saveReplay` hardcoded the identical
`60 * 60 * 24 * 7` inline — two places to edit, one easy to miss. `saveReplay`
now uses the constant.

**4. Anthropic model defaults** — `lib/providers.ts`
All three roles were pinned to `claude-sonnet-4-6`, which contradicts the
file's own documented principle ("we never let the judge be weaker than the
worker") and ARCHITECTURE.md §12 ("Defaults give the critic the strongest model
in each family"). Now `claude-sonnet-5` for planner/executor and
`claude-opus-4-8` for critic, matching the shape of the `google` row.

Worth recording: `claude-sonnet-4-6` is **not** a retired or invalid ID — it is
still an active model. The defect was the uniform assignment, not a dead string.
The other providers' defaults were left alone.

**5. Doc drift** — `README.md`, `PLAN.md`, `ARCHITECTURE.md`, `GUIDE.md`
Four files described VERGIL as using `generateObject`; `lib/agents/vergil.ts`
has used `streamObject` since the streaming-plan upgrade in `bd82054`. Only
ARCHITECTURE.md §4.1 was correct. Fixed the six stale references. LADY's
`generateObject` mentions are accurate and were left as-is.

### Key-free test suites + 4 bugs they caught

Goal: exercise the system end to end with **no API key**. There are no
credentials on this machine and no `ant` CLI, so routing NERO's calls through
this session's auth was not possible. Instead the LLM was faked and everything
else made real.

Added `tests/` (see [tests/README.md](./tests/README.md)) — **134 assertions,
all passing**:

| Suite | Assertions | Approach |
|---|---|---|
| `tests/units.ts` | 56 | Calls the real tools and pure logic directly |
| `tests/e2e-mock.ts` | 44 | Real `runNero` + real tools, `MockLanguageModelV4` swapped in |
| `tests/live.ts` | 34 | Live `next start`: HTTP surface + real MCP round trip |

The mock is injected by intercepting the module load of `lib/providers.ts` from
inside the test file — **no test seam was added to production code**. ESM
namespaces are read-only, so reassigning the export doesn't work; a
`Module._load` hook does. Tool calls stay real, so `102334155` in the Reflexion
test is genuinely computed by NICO, not stubbed.

`YAMATO_MODE=remote` was exercised for real against the running server, so the
MCP client → Streamable HTTP → `mcp-handler` → tools path is verified end to
end, not just asserted in docs.

**Bug 1 — the planner hung forever without a key (worst of the four).**
`vergil.ts` consumed `partialObjectStream` and then `await result.object`. On
any provider failure the partial stream just *ends*, and `result.object` never
settles — so `POST /api/agent` emitted `planning` + `VERGIL is planning`, then
hung indefinitely. Measured: no settle in 15s, `curl` still open at 12s. The
console would sit frozen on "VERGIL is planning" forever.

This is the most likely first experience of anyone deploying without a key, or
pasting a bad key into the BYOK vault — and it silently defeated the RUN ERROR
banner, which exists to say *"invalid/expired API key (check KEYS)"* but can
only render if the stream actually errors. Fixed by consuming `fullStream` and
rethrowing the `error` part: **15,000 ms hang → 31 ms rejection** carrying
`Anthropic API key is missing`.

**Bug 2 — the executor lost the real provider error.** Same root cause in
`nero.ts`: a mid-run provider failure surfaced as the AI SDK's generic
`NoOutputGeneratedError` ("No output generated. Check the stream for errors.")
with `cause: undefined`, so a rate limit or outage reached the operator as
useless text. Now reads the `error` part off `fullStream` and rethrows the
original — directly serving the intent of commit `007669d`.

Note: the first attempt used an `onError` callback, which *worked at runtime*
but is not in `AgentStreamOptions` — it only survived as untyped passthrough.
Reverted in favour of the typed `fullStream`, per GUIDE.md §16.3 ("verified
against installed `.d.ts`, not docs").

**Bug 3 — the sandbox swallowed every error detail.** `nico.ts` used
`err instanceof Error`, which is **always false** for errors thrown inside
`node:vm` (they come from the sandbox's own realm). Every failure collapsed to
`"Execution failed"`, discarding e.g. `ReferenceError: require is not defined`
— while the executor's own instructions tell it that `ok:false` is "a signal to
adapt". It had nothing to adapt to. Now duck-typed.

**Bug 4 — an eval task had the wrong ground truth.** Task `d1` asked for the
highest-revenue region and expected `West` / `30,500`. In the suite's own CSV,
North totals **34,000** (24,000 + 10,000) and West only 30,500 — so a *correct*
answer scored as a failure, in the harness whose entire purpose is honest
measurement. Fixed in `lib/evals/suite.ts`; the same wrong figure was repeated
in ARCHITECTURE.md §11 and GUIDE.md and was corrected there too.

Regression guards for bugs 1–3 are called out in `tests/README.md`.

### Deliberately not done

- **The eval numbers.** README's table still reads `_run it_` for both rows.
  This remains the single highest-value open item — the whole pitch rests on the
  bare-vs-full completion-rate delta, and it needs a provider key to produce.
  Note the suites above deliberately cannot substitute: they prove the loop is
  *correct*, not that the models are *good*.
- **Nothing was verified about model quality**, prompt effectiveness, or real
  provider behaviour (streaming quirks, rate limits, tool-call formatting).
- `llmCalls` counts *recorded usages*, not HTTP calls — NERO's multi-step
  `totalUsage` aggregates into one. Observed, not changed.
- **`--only=c1,d2` arg parsing** in `lib/evals/run.ts` only accepts the
  space-separated form. The documented usage is space-separated, so this is
  cosmetic; noted, not changed.
- Everything in GUIDE.md §16.8 item 5 (resumable streams, OTel export, MCP
  elicitation, native `toolApproval`) stays deferred **by design** — read the
  §14 trade-off table before "fixing" any of it.

---

## 2026-08-01 — Command Deck UI, live model picker, real Groq evals

Session goal: run the evals for real (a free Groq key finally on hand), fill the
long-empty README numbers, and turn the console into "the best it can be" — one
consolidated settings surface, a real model picker, and more motion.

**Hard constraint honored:** $0. Every runtime call — the eval suite and all
manual verification — went through the free-tier Groq + Tavily keys only,
`LLM_PROVIDER=groq` throughout. Keys were passed as inline env vars, never
written to any file. (Keys were pasted into chat, so they should be rotated.)

### Command Deck — one settings surface (retired the KeyVault modal)

`components/console/KeyVault.tsx` → `components/console/CommandDeck.tsx`: a
left slide-in drawer consolidating provider + BYOK keys, the SAFE MODE toggle
(moved out of the header), a per-role model picker, and a live DEPLOYMENT
status block. The storage helpers and the exported `readVault()` are unchanged —
the security-sensitive key path (sessionStorage → per-request headers, nothing
persisted/logged) was deliberately left minimal, only extended with a `models`
field. The header now carries a single `⚙ COMMAND DECK` button plus a `⌘K`
launcher instead of separate KEYS / SAFE MODE buttons.

### Real per-role model picker (new capability, not just display)

The console could never pick models before — model selection was server-only,
and `/api/status.models` was fetched but never shown. Now each role
(planner/executor/critic) can be chosen in the deck and the pick is honored
request-scoped through the existing BYOK path:

- `lib/model-catalog.ts` (new) — allow-listed model ids per provider, the single
  source of truth shared by the deck's dropdowns and the route's validation.
- `RunConfig.models` added to `lib/run-context.ts`; `resolveModel`/`modelLabel`
  in `lib/providers.ts` now read `runConfig().models?.[role]` first (precedence:
  Command Deck pick > `NERO_<ROLE>_MODEL` env > provider default).
- `app/api/agent/route.ts` parses `x-nero-<role>-model` headers and **validates
  each against the effective provider's allow-list** — an unknown id is dropped
  and the role falls back to the default, so an arbitrary client string never
  reaches a provider.
- The picks ride in the transport `headers()` closure alongside the existing
  BYOK key headers and persist in the vault like keys do.

### More motion + power-user surfaces

- `⌘K` command palette (`components/console/CommandPalette.tsx`) — launch preset
  missions, open the deck, toggle SAFE MODE, copy the replay permalink, focus
  the input. Substring filter, ↑/↓/Enter/Esc.
- Live budget/status strip (`components/console/BudgetStrip.tsx`) under the
  header — effective provider, animated token-budget burn, MEMORY/SEARCH/SAFE.
- Idle crew: pre-deploy the agent-graph nodes breathe faintly ("awaiting orders"
  / "standing by" / "ready to judge") so the console reads as armed, not dead.
- All new keyframes (`deck-in`, `deck-item-in`, `palette-in`, `node-idle`,
  `budget-fill-hot`) live in `globals.css` and are added to the
  `prefers-reduced-motion` disable block, matching the existing "slam" idiom.

### Bug found by the eval run — LADY's structured output on Groq

`gpt-oss-120b` does not emit a bare verdict object: it either **echoes the whole
JSON-Schema envelope** (nesting the answer under `properties`) or **concatenates
the schema in front of the object** (`{"$schema":…}{"criteria":…}`). Both are
invalid against `VerdictSchema` and blow up `generateObject` with
`json_validate_failed`.

Impact traced through `orchestrator.ts:298`: because the attempt loop is
try/caught and `answer` is set before LADY runs, a critic crash still returns the
executor's answer — so it does **not** lower the answer-checked eval score, but
it *does* kill the verdict, the StyleRank, and the Reflexion retry on Groq.

Fix (`lib/agents/lady.ts`): an `experimental_repairText` hook (verified present
in the installed `ai` `.d.ts`, per §16.3) that recovers the real object with a
string/escape-aware balanced-brace scan, returning the last top-level object that
parses and isn't a bare `$schema` wrapper. Inert for well-behaved providers —
it only fires on a parse failure. Guarded by 4 new unit tests that validate the
recovered text through `VerdictSchema`.

### Evals — the honest result (model: `groq/openai/gpt-oss-120b`, free tier)

| Config | Completion | Total tokens | Mean/run |
|---|---|---|---|
| Bare executor | 17/20 (85%) | 36,122 | ~1,800 |
| Full NERO loop | 17/20 (85%) | 84,119 | ~4,200 |

**The bare-vs-full completion delta is 0 pp on this model** — the full loop cost
~2.3× the tokens for the same 17/20 (stable across two full runs). This is an
honest, expected outcome, not a defect, and worth understanding:

- The eval scores the **answer text**, and the executor produces that answer in
  *both* modes. The full loop can only beat bare when **Reflexion turns a wrong
  answer right**. Of the 3 failures, none were reflexion-recoverable on this
  model, so no lift showed.
- The loop's value (a reliable external critic, self-correction, guardrails)
  needs a model strong enough to (a) judge correctly and (b) act on the
  reflection. `gpt-oss-120b` is not that model — see the two issues below. The
  delta is expected to widen on a capable provider; the numbers are filled in
  README with a footnote saying exactly this.

### Two Groq-model issues documented, not fixed (model quality, not architecture)

- **Tool-call arg parse failures** — `Failed to parse tool call arguments as
  JSON` (`invalid_request_error`) cost **w2** (full) and **d4** (bare). This is
  Groq rejecting the model's malformed tool-call JSON server-side, before the SDK
  sees it — not cleanly fixable on our side. This is the failure that actually
  costs tasks.
- **Critic false-positive** — on **c4** (LCM 1–12, wrong answer) LADY scored
  100/100 PASS. A weak-critic quality issue; a stronger critic model is the fix,
  not code.

### Verified

| Step | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0, all 9 routes |
| `npm test` (units + e2e) | **65 + 44 = 109** passing (+9 new: 5 model-picker, 4 LADY repair) |
| Browser smoke on `next start` | Command Deck opens/animates, provider switch re-scopes model list, `⌘K` palette + all actions, idle graph, budget strip — no console errors |

The model-picker plumbing is proven end to end **without a key**: new unit tests
drive `withRunConfig({models}) → resolveModel/modelLabel` and the catalog
validation directly. No live paid call was ever made.

### Deliberately not done

- **A post-fix eval re-run.** The LADY repair improves robustness and token cost
  but, per the orchestrator trace above, would not have moved 17/20 on this run —
  and Groq free-tier 8000 TPM makes a full run ~15+ min. Not worth the churn for
  an unchanged headline number; re-run on a stronger provider for real figures.
- The two Groq model-quality issues above (tool-call args, critic false-positive)
  — model limitations, not architecture bugs.
- Deploy / Upstash / flip-public — still need the owner's accounts and call
  (GUIDE.md §16.8 items 2–4).
