/**
 * Key-free unit tests: deterministic tools + pure logic.
 * Run: npx tsx tests/units.ts
 */
import { ARSENAL } from "@/lib/tools/registry";
import { scoreToRank } from "@/ai/types";
import { TokenBudget } from "@/lib/budget";
import { deriveConsoleState } from "@/lib/derive";
import { ApprovalBroker, withApprovalGate, decide } from "@/lib/approvals";
import { TASKS } from "@/lib/evals/suite";
import { withRunConfig } from "@/lib/run-context";
import { modelLabel, resolveModel } from "@/lib/providers";
import { isKnownModel } from "@/lib/model-catalog";
import { repairStructuredJson, isStructuredOutputError } from "@/lib/agents/json-repair";
import { errorMessage } from "@/lib/errors";
import { VerdictSchema } from "@/lib/agents/schemas";
import type { NeroUIMessage } from "@/ai/types";
import type { ToolSet } from "ai";

let pass = 0;
let fail = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ❌ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

const call = (t: unknown, args: unknown) =>
  (t as { execute: (a: unknown, o: unknown) => Promise<any> }).execute(args, {
    toolCallId: "t", messages: [], context: undefined,
  });

async function main() {
  // ── NICO: sandboxed JS ────────────────────────────────────────────
  console.log("\nNICO — run_js");
  {
    const r = await call(ARSENAL.run_js, { code: "let a=1,b=1;for(let i=3;i<=40;i++){[a,b]=[b,a+b]}b" });
    check("fib(40) = 102334155", r.ok && r.result === "102334155", r);

    const r2 = await call(ARSENAL.run_js, { code: "console.log('x');console.log('y');42" });
    check("console.log captured", r2.ok && r2.logs === "x\ny" && r2.result === "42", r2);

    const r3 = await call(ARSENAL.run_js, { code: "require('fs')" });
    check("require blocked AND real error surfaced", r3.ok === false && /ReferenceError: require is not defined/.test(r3.error), r3);

    const r4 = await call(ARSENAL.run_js, { code: "process.exit(1)" });
    check("process is blocked", r4.ok === false, r4);

    const r5 = await call(ARSENAL.run_js, { code: "fetch('http://x')" });
    check("fetch is blocked (no network)", r5.ok === false, r5);

    const t0 = Date.now();
    const r6 = await call(ARSENAL.run_js, { code: "while(true){}" });
    const ms = Date.now() - t0;
    check("infinite loop hits 2s timeout", r6.ok === false && ms < 4000, { ms, err: r6.error });

    const r7 = await call(ARSENAL.run_js, { code: "throw new Error('boom')" });
    check("throw → ok:false carrying name+message", r7.ok === false && /Error: boom/.test(r7.error), r7);
  }

  // ── KALINA ANN: CSV ───────────────────────────────────────────────
  console.log("\nKALINA ANN — csv_describe / csv_aggregate");
  const CSV = `region,product,units,revenue
North,Blade,120,24000
South,Blade,80,16000
North,Gun,200,10000
South,Gun,150,7500
East,Blade,60,12000
East,Gun,90,4500
West,Blade,140,28000
West,Gun,50,2500`;
  {
    const d = await call(ARSENAL.csv_describe, { csv: CSV });
    check("describe: 8 rows", d.ok && d.rowCount === 8, d);
    const region = d.columns.find((c: any) => c.column === "region");
    const revenue = d.columns.find((c: any) => c.column === "revenue");
    check("region typed categorical (4 unique)", region?.type === "categorical" && region?.uniqueValues === 4, region);
    check("revenue typed numeric, max 28000", revenue?.type === "numeric" && revenue?.max === 28000, revenue);
    check("revenue mean = 13062.5", revenue?.mean === 13062.5, revenue);

    const a = await call(ARSENAL.csv_aggregate, { csv: CSV, groupBy: "region", metric: "revenue", agg: "sum" });
    check("aggregate: North wins with 34000", a.ok && a.table[0].region === "North" && a.table[0].sum_revenue === 34000, a.table?.[0]);
    check("aggregate: sorted descending", a.ok && a.table.every((r: any, i: number) => i === 0 || a.table[i - 1].sum_revenue >= r.sum_revenue), a.table);

    const u = await call(ARSENAL.csv_aggregate, { csv: CSV, groupBy: "product", metric: "units", agg: "sum" });
    const gun = u.table.find((r: any) => r.product === "Gun");
    check("aggregate: Gun units = 490", gun?.sum_units === 490, u.table);

    const bad = await call(ARSENAL.csv_aggregate, { csv: CSV, groupBy: "nope", metric: "revenue" });
    check("bad column → ok:false listing real columns", bad.ok === false && /region, product, units, revenue/.test(bad.error), bad);

    const quoted = await call(ARSENAL.csv_describe, { csv: 'name,note\n"Doe, John",hi\n"Roe, Jane",yo' });
    check("quote-aware parser keeps commas inside quotes", quoted.ok && quoted.rowCount === 2, quoted);

    const short = await call(ARSENAL.csv_describe, { csv: "just_a_header_row_alone" });
    check("header-only CSV → ok:false, no throw", short.ok === false, short);
  }

  // ── BLUE ROSE ─────────────────────────────────────────────────────
  console.log("\nBLUE ROSE — web_search / web_fetch");
  {
    const s = await call(ARSENAL.web_search, { query: "anything", maxResults: 3 });
    check("web_search w/o key degrades to ok:false w/ guidance", s.ok === false && /not configured/i.test(s.error), s);

    const f = await call(ARSENAL.web_fetch, { url: "https://example.com" });
    if (f.ok) {
      check("web_fetch strips HTML → 'Example Domain'", /Example Domain/.test(f.content), f.content?.slice(0, 120));
      check("web_fetch fences content as untrusted", /<untrusted_web_content source="https:\/\/example.com">/.test(f.content), f.content?.slice(0, 90));
      check("web_fetch removes all tags", !/<(script|style|div|p)\b/i.test(f.content), true);
    } else {
      console.log(`  ⚠️  web_fetch skipped (no network): ${f.error}`);
    }

    const bad = await call(ARSENAL.web_fetch, { url: "https://httpbin.org/status/404" });
    check("web_fetch non-200 → ok:false (never throws)", bad.ok === false, bad);
  }

  // ── Rank mapping ──────────────────────────────────────────────────
  console.log("\nscoreToRank — D→SSS ladder");
  {
    const cases: [number, string][] = [
      [0, "D"], [39, "D"], [40, "C"], [54, "C"], [55, "B"], [69, "B"],
      [70, "A"], [79, "A"], [80, "S"], [89, "S"], [90, "SS"], [96, "SS"],
      [97, "SSS"], [100, "SSS"],
    ];
    const wrong = cases.filter(([n, r]) => scoreToRank(n) !== r);
    check("all 14 boundary scores map correctly", wrong.length === 0, wrong);
    check("pass gate (70) is exactly rank A", scoreToRank(70) === "A" && scoreToRank(69) === "B", true);
  }

  // ── TokenBudget ───────────────────────────────────────────────────
  console.log("\nTokenBudget — the hard guardrail");
  {
    const b = new TokenBudget(1000);
    check("starts un-exceeded", !b.exceeded && b.totalTokens === 0);
    b.record({ inputTokens: 100, outputTokens: 50 } as any);
    check("accumulates in+out", b.totalTokens === 150 && b.llmCalls === 1, b.totalTokens);
    b.record(undefined);
    check("undefined usage is a no-op, not a crash", b.totalTokens === 150 && b.llmCalls === 1);
    check("cost = conservative flat rate", Math.abs(b.estCostUsd - (100 * 3 + 50 * 15) / 1e6) < 1e-12, b.estCostUsd);
    b.record({ inputTokens: 900, outputTokens: 0 } as any);
    check("trips at >= cap", b.exceeded && b.totalTokens === 1050, b.totalTokens);
  }

  // ── deriveConsoleState ────────────────────────────────────────────
  console.log("\nderiveConsoleState — the shared live/replay fold");
  {
    const msgs = [{
      id: "m1", role: "assistant",
      parts: [
        { type: "data-run-status", id: "run-status", data: { phase: "planning", message: "a" } },
        { type: "data-tool-call", id: "tool-c1", data: { callId: "c1", toolName: "run_js", status: "running", input: {}, attempt: 1, stepIndex: null } },
        { type: "data-tool-call", id: "tool-c1", data: { callId: "c1", toolName: "run_js", status: "done", input: {}, output: { ok: true }, latencyMs: 12, attempt: 1, stepIndex: null } },
        { type: "text", text: "first attempt answer" },
        { type: "data-verdict", id: "verdict-1", data: { attempt: 1, score: 55, rank: "B", pass: false, critique: "no", criteria: [] } },
        { type: "text", text: "second attempt answer" },
        { type: "data-verdict", id: "verdict-2", data: { attempt: 2, score: 95, rank: "SS", pass: true, critique: "ok", criteria: [] } },
        { type: "data-run-status", id: "run-status", data: { phase: "done", message: "Mission accomplished" } },
        { type: "data-span", id: "span-planner-1", data: { label: "p", role: "planner", attempt: 1, startMs: 50, durMs: 5, tokens: 1 } },
        { type: "data-span", id: "span-critic-1", data: { label: "c", role: "critic", attempt: 1, startMs: 10, durMs: 5, tokens: 1 } },
      ],
    }] as unknown as NeroUIMessage[];

    const s = deriveConsoleState(msgs);
    check("tool call reconciles in place (1 row, not 2)", s.toolCalls.length === 1 && s.toolCalls[0].status === "done", s.toolCalls);
    check("trace upserts by id (no duplicate row)", s.trace.filter((t) => t.kind === "tool").length === 1, s.trace.length);
    check("last text part wins (retry replaces)", s.finalText === "second attempt answer", s.finalText);
    check("last verdict wins", s.verdict?.attempt === 2 && s.verdict?.pass === true, s.verdict);
    check("fixed-id status is a single updating cell", s.runStatus?.phase === "done", s.runStatus);
    check("spans sorted by startMs", s.spans[0].role === "critic" && s.spans[1].role === "planner", s.spans.map((x) => x.role));
    check("empty input yields empty state, no throw", deriveConsoleState([]).eventCount === 0);
  }

  // ── HITL approval gate ────────────────────────────────────────────
  console.log("\nHITL gate — withApprovalGate + ApprovalBroker");
  {
    const emitted: { id: string; status: string }[] = [];
    const broker = new ApprovalBroker((id, d) => emitted.push({ id, status: d.status }), () => 1);
    const gated = withApprovalGate(ARSENAL as unknown as ToolSet, broker, true);

    check("safe tool passes through ungated", gated.csv_describe === (ARSENAL as any).csv_describe);
    check("dangerous tool is wrapped", gated.run_js !== (ARSENAL as any).run_js);

    // ALLOW
    const allowP = (gated.run_js as any).execute({ code: "1+1" }, {});
    await new Promise((r) => setTimeout(r, 700));
    const pendingId = emitted[0].id;
    check("pending approval emitted", emitted[0]?.status === "pending", emitted[0]);
    check("decide() on a pending id succeeds", await decide(pendingId, true));
    const allowed = await allowP;
    check("ALLOW → real tool actually executes", allowed.ok === true && allowed.result === "2", allowed);
    check("card reconciles to approved (same id)", emitted[1]?.id === pendingId && emitted[1]?.status === "approved", emitted[1]);
    check("double-decide is rejected", (await decide(pendingId, true)) === false);
    check("unknown id is rejected", (await decide("approval-nope", true)) === false);

    // DENY
    emitted.length = 0;
    const denyP = (gated.run_js as any).execute({ code: "1+1" }, {});
    await new Promise((r) => setTimeout(r, 700));
    await decide(emitted[0].id, false);
    const denied = await denyP;
    check("DENY → structured ok:false, run survives", denied.ok === false && /DENIED/.test(denied.error), denied);
    check("denial tells agent not to retry", /Do not retry/.test(denied.error), denied.error);

    // Gate disabled
    const open = withApprovalGate(ARSENAL as unknown as ToolSet, broker, false);
    check("gate disabled → identical toolset (no wrap)", open.run_js === (ARSENAL as any).run_js);
  }

  // ── Model picker: request-scoped per-role override ────────────────
  // Guards the Command Deck feature end to end WITHOUT a key or network:
  // the exact header → RunConfig.models → resolveModel/modelLabel path.
  console.log("\nMODEL PICKER — request-scoped per-role override");
  {
    check("catalog validates a known groq id", isKnownModel("groq", "openai/gpt-oss-120b"));
    check("catalog rejects an unknown id", !isKnownModel("groq", "totally-made-up-model"));

    const criticLabel = await withRunConfig(
      { provider: "groq", models: { critic: "openai/gpt-oss-20b" } },
      async () => modelLabel("critic"),
    );
    check("override changes the resolved critic label", criticLabel === "groq/openai/gpt-oss-20b", criticLabel);

    const plannerLabel = await withRunConfig(
      { provider: "groq", models: { critic: "openai/gpt-oss-20b" } },
      async () => modelLabel("planner"),
    );
    check("un-overridden role keeps the provider default", plannerLabel === "groq/openai/gpt-oss-120b", plannerLabel);

    const model = await withRunConfig(
      { provider: "groq", models: { executor: "openai/gpt-oss-20b" } },
      async () => resolveModel("executor"),
    );
    check("resolveModel returns a bound model for the override", Boolean(model));
  }

  // ── LADY structured-output repair (Groq gpt-oss-120b quirk) ───────
  // The critic crashed on Groq because gpt-oss-120b prepends the JSON
  // schema, emitting two concatenated objects. Guard the recovery path.
  console.log("\nJSON REPAIR — Groq gpt-oss schema-echo variants");
  {
    const realVerdict =
      '{"criteria":[{"name":"task_completion","score":90,"justification":"correct"},{"name":"tool_usage","score":85,"justification":"ok"},{"name":"grounding","score":95,"justification":"grounded"}],"overallScore":90,"pass":true,"critique":"solid","reflection":""}';
    const okVerdict = (s: string | null) =>
      s !== null && VerdictSchema.safeParse(JSON.parse(s)).success;

    // Variant 1: schema concatenated in front of the real object.
    const prepended =
      '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"criteria":{}}}' +
      realVerdict;
    const r1 = repairStructuredJson(prepended);
    check("extracts the real object past the prepended schema", r1 === realVerdict, r1);
    check("prepended → validates against VerdictSchema", okVerdict(r1));

    // Variant 2: real VALUES nested under a schema envelope's `properties`.
    const nestedUnderProps =
      '{"$schema":"x","type":"object","required":["pass"],"properties":' + realVerdict + "}";
    check("recovers values nested under properties", okVerdict(repairStructuredJson(nestedUnderProps)));

    // Variant 3: a justification carrying braces + escaped quotes.
    const braces =
      '{"$schema":"x"}{"criteria":[{"name":"task_completion","score":1,"justification":"has {brace} and \\"quote\\""},{"name":"tool_usage","score":1,"justification":"j"},{"name":"grounding","score":1,"justification":"j"}],"overallScore":1,"pass":false,"critique":"c","reflection":"r"}';
    check("brace/quote-safe scan survives strings with braces", okVerdict(repairStructuredJson(braces)));

    // Variant 4: wrapped in a ```json fence.
    check("strips a ```json fence", okVerdict(repairStructuredJson("```json\n" + realVerdict + "\n```")));

    check("returns null when there is no recoverable object", repairStructuredJson("not json at all") === null);
  }

  // ── Error messaging — no "[object Object]" ────────────────────────
  // Providers surface plain objects; String(obj) is useless and defeats the
  // structured-output classifier (→ the run failed with "[object Object]").
  console.log("\nERROR MESSAGING — dig out real provider messages");
  {
    check("Error → its message", errorMessage(new Error("boom")) === "boom");
    check("string passthrough", errorMessage("plain string") === "plain string");
    check("nested {error:{message}} extracted", errorMessage({ error: { message: "rate limit reached" } }) === "rate limit reached");
    check("top-level {message} extracted", errorMessage({ message: "schema mismatch" }) === "schema mismatch");
    check("never returns [object Object]", errorMessage({ foo: 1 }) !== "[object Object]");
    // The object-shaped schema error now classifies correctly → retried/fell back
    check(
      "object-shaped schema error is recognized (would retry, not crash)",
      isStructuredOutputError({ error: { message: "Generated JSON does not match the expected schema" } }) === true,
    );
    check(
      "object-shaped auth error is NOT masked as structured",
      isStructuredOutputError({ error: { message: "invalid api key" } }) === false,
    );
  }

  // ── Eval suite integrity ──────────────────────────────────────────
  console.log("\nREBELLION — suite integrity");
  {
    check("20 tasks", TASKS.length === 20, TASKS.length);
    const byCat = TASKS.reduce<Record<string, number>>((a, t) => ((a[t.category] = (a[t.category] ?? 0) + 1), a), {});
    check("7 compute / 5 data / 4 reasoning / 4 web", byCat.compute === 7 && byCat.data === 5 && byCat.reasoning === 4 && byCat.web === 4, byCat);
    check("all ids unique", new Set(TASKS.map((t) => t.id)).size === 20);
    check("checks accept the true answer", TASKS.find((t) => t.id === "c1")!.check("It is 102334155.") === true);
    check("d1 ground truth matches the CSV (North/34000)", TASKS.find((t) => t.id === "d1")!.check("North, with 34,000 total revenue.") === true);
    check("d1 rejects the old wrong answer (West/30500)", TASKS.find((t) => t.id === "d1")!.check("West, with 30,500.") === false);
    check("checks reject a wrong answer", TASKS.find((t) => t.id === "c1")!.check("It is 12345.") === false);
    check("thousand-separator tolerance works", TASKS.find((t) => t.id === "c6")!.check("31,536,000 seconds") === true);
    const empty = TASKS.filter((t) => t.check(""));
    check("no check passes on an empty answer", empty.length === 0, empty.map((t) => t.id));
  }

  console.log(`\n${"─".repeat(52)}`);
  console.log(`UNITS: ${pass} passed, ${fail} failed`);
  if (fail) console.log(`failures: ${fails.join(", ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(1); });
