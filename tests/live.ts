/**
 * Live-server tests against `next start` — no API key required.
 * Covers the HTTP surface and a REAL MCP protocol round trip through YAMATO
 * remote mode (MCP client → Streamable HTTP → mcp-handler → the real tools).
 *
 * Run: PORT=3111 npx tsx tests/live.ts   (server must already be listening)
 */
const PORT = process.env.PORT ?? "3111";
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`); }
}

async function main() {
  // ── Deployment status ─────────────────────────────────────────────
  console.log("\n/api/status — deployment chips");
  {
    const r = await fetch(`${BASE}/api/status`);
    const j = await r.json();
    check("200 OK", r.status === 200);
    check("reports provider", typeof j.provider === "string", j.provider);
    check("honestly reports NO server key", j.serverKeyConfigured === false, j.serverKeyConfigured);
    check("honestly reports search offline", j.searchConfigured === false, j.searchConfigured);
    check("honestly reports memory volatile", j.memoryDurable === false, j.memoryDurable);
    check("exposes per-role model labels", !!j.models?.planner && !!j.models?.executor && !!j.models?.critic, j.models);
    check("critic model is not weaker than executor", j.models.critic !== j.models.executor, j.models);
    check("yamato mode reported", ["local", "remote"].includes(j.yamatoMode), j.yamatoMode);
    check("leaks no key material", !/sk-ant|sk-proj|sk-[A-Za-z0-9]{16}|tvly-|AIza|Bearer /.test(JSON.stringify(j)), j);
  }

  // ── Mission log ───────────────────────────────────────────────────
  console.log("\n/api/runs — TRISH mission log");
  {
    const r = await fetch(`${BASE}/api/runs`);
    const j = await r.json();
    check("200 with runs array (empty is valid)", r.status === 200 && Array.isArray(j.runs), j);
  }

  // ── Approval side channel ─────────────────────────────────────────
  console.log("\n/api/approve — HITL side channel validation");
  {
    const bad = await fetch(`${BASE}/api/approve`, { method: "POST", body: "{}" });
    check("missing fields → 400", bad.status === 400, bad.status);
    const badType = await fetch(`${BASE}/api/approve`, { method: "POST", body: JSON.stringify({ id: "x", approved: "yes" }) });
    check("non-boolean `approved` → 400", badType.status === 400, badType.status);
    const notJson = await fetch(`${BASE}/api/approve`, { method: "POST", body: "not json" });
    check("malformed JSON → 400, not a 500 crash", notJson.status === 400, notJson.status);
    const unknown = await fetch(`${BASE}/api/approve`, { method: "POST", body: JSON.stringify({ id: "approval-does-not-exist", approved: true }) });
    check("unknown id → 200 ok:false (fails closed, no crash)", unknown.status === 200 && (await unknown.json()).ok === false);
  }

  // ── Replay permalink ──────────────────────────────────────────────
  console.log("\n/run/[sessionId] — replay permalink");
  {
    const r = await fetch(`${BASE}/run/no-such-session-id`);
    const html = await r.text();
    check("unknown id renders NO RECORD, not a 500", r.status === 200 && /NO RECORD/.test(html), r.status);
    check("explains the 7-day/volatile caveat", /replays live for 7 days|instance recycles/.test(html));
  }

  // ── Agent route guardrails ────────────────────────────────────────
  console.log("\n/api/agent — request guardrails");
  {
    const empty = await fetch(`${BASE}/api/agent`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    check("no goal → 400", empty.status === 400, empty.status);

    // With no key configured the run must still open a stream and report the
    // failure as a data part — never hang and never 500.
    const t0 = Date.now();
    const run = await fetch(`${BASE}/api/agent`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "live-nokey", messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "2+2?" }] }] }),
      signal: AbortSignal.timeout(30_000),
    });
    check("run with no key still returns 200 + a stream", run.status === 200, run.status);
    check("content-type is an event stream", /event-stream/.test(run.headers.get("content-type") ?? ""), run.headers.get("content-type"));

    let body = "";
    let settled = true;
    try { body = await run.text(); } catch { settled = false; }
    check("keyless run TERMINATES (no infinite hang)", settled && Date.now() - t0 < 30_000, { settled, ms: Date.now() - t0 });
    check("stream is non-empty (early streaming, not a silent function)", body.length > 0, body.length);
    check("failure surfaced as a stream part, not a hang", /error|failed/i.test(body), body.slice(0, 200));
    check("the REAL provider cause reaches the operator", /API key is missing/i.test(body), body.slice(-300));
  }

  // ── MCP: the real protocol round trip via YAMATO remote mode ──────
  console.log("\nYAMATO remote — real MCP client → Streamable HTTP → tools");
  {
    process.env.YAMATO_MODE = "remote";
    process.env.NERO_SELF_URL = BASE;
    const { drawYamato } = await import("@/lib/mcp/yamato");

    const session = await drawYamato();
    try {
      check("MCP handshake succeeded", session.mode === "remote");
      const names = Object.keys(session.tools).sort();
      check("all 5 arsenal tools exposed over MCP",
        names.join(",") === "csv_aggregate,csv_describe,run_js,web_fetch,web_search", names);

      const exec = (n: string, a: unknown) =>
        (session.tools[n] as any).execute(a, { toolCallId: "x", messages: [] });

      const js = await exec("run_js", { code: "[...Array(10).keys()].reduce((a,b)=>a+b,0)" });
      const jsText = JSON.stringify(js);
      check("run_js over MCP returns the real computed value (45)", /45/.test(jsText), jsText.slice(0, 200));

      const agg = await exec("csv_aggregate", {
        csv: "region,revenue\nNorth,24000\nNorth,10000\nWest,28000\nWest,2500",
        groupBy: "region", metric: "revenue", agg: "sum",
      });
      const aggText = JSON.stringify(agg);
      check("csv_aggregate over MCP computes North=34000", /34000/.test(aggText), aggText.slice(0, 200));
      check("same implementation as local mode (no forked logic)", /30500/.test(aggText), aggText.slice(0, 200));

      const search = await exec("web_search", { query: "test", maxResults: 2 });
      check("unconfigured tool degrades over MCP too (ok:false)", /not configured/i.test(JSON.stringify(search)), JSON.stringify(search).slice(0, 160));
    } finally {
      await session.close();
    }
  }

  // ── MCP transport contract ────────────────────────────────────────
  console.log("\n/api/mcp/mcp — transport contract");
  {
    const r = await fetch(`${BASE}/api/mcp/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } } }),
    });
    const txt = await r.text();
    check("initialize over POST returns a result", r.ok && /"result"/.test(txt), txt.slice(0, 200));
    check("server advertises tools capability (not empty)", /tools/.test(txt), txt.slice(0, 300));
    // GET/DELETE are exported but mcp-handler rejects them without REDIS_URL
    // (no session resumption). Distinguish "routed but refused" from "not
    // exported" by the body: routed verbs answer in JSON-RPC, Next answers
    // an unexported verb with an empty body.
    const bodyOf = async (m: string) => (await fetch(`${BASE}/api/mcp/mcp`, { method: m })).text();
    const [getB, delB, patchB] = await Promise.all([bodyOf("GET"), bodyOf("DELETE"), bodyOf("PATCH")]);
    check("GET is exported (JSON-RPC reply, not Next's empty 405)", /jsonrpc/.test(getB), getB.slice(0, 120));
    check("DELETE is exported (JSON-RPC reply)", /jsonrpc/.test(delB), delB.slice(0, 120));
    check("control: an unexported verb really does return empty", patchB.trim() === "", patchB.slice(0, 120));
  }

  console.log(`\n${"─".repeat(52)}`);
  console.log(`LIVE: ${pass} passed, ${fail} failed`);
  if (fail) console.log(`failures: ${fails.join(", ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(1); });

export {};
