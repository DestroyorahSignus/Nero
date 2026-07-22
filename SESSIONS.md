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
