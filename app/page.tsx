import Link from "next/link";
import { CutPanel } from "@/components/ui/CutPanel";

const AGENTS = [
  {
    name: "VERGIL",
    role: "Planner",
    weapon: "generateObject + Zod PlanSchema",
    color: "text-ember",
    accent: "var(--color-ember)",
    desc: "Decomposes the goal into a schema-validated plan with checkable success criteria, then steps back. Never executes.",
  },
  {
    name: "NERO",
    role: "Executor",
    weapon: "ToolLoopAgent · stopWhen stepCountIs(12)",
    color: "text-spectral",
    accent: "var(--color-spectral)",
    desc: "Carries the plan out with MCP tools — search, fetch, sandboxed code, data analysis — streaming every call live.",
  },
  {
    name: "LADY",
    role: "Critic",
    weapon: "LLM-as-judge rubric · external signal",
    color: "text-crimson",
    accent: "var(--color-crimson)",
    desc: "Judges task completion, tool usage, grounding. Fails plausible-but-unverified answers on principle.",
  },
  {
    name: "TRISH",
    role: "Memory",
    weapon: "Upstash Redis · reflections + run log",
    color: "text-arcane",
    accent: "var(--color-arcane)",
    desc: "Stores the critic's verbal reflections between attempts — the Reflexion mechanism — plus long-term run records.",
  },
];

const ARSENAL = [
  {
    server: "BLUE ROSE",
    tools: "web_search · web_fetch",
    desc: "Web reconnaissance over Tavily, with honest degradation when unconfigured",
  },
  {
    server: "NICO",
    tools: "run_js",
    desc: "Isolated JavaScript execution — 2s CPU wall, zero ambient authority",
  },
  {
    server: "KALINA ANN",
    tools: "csv_describe · csv_aggregate",
    desc: "Deterministic dataset profiling and group-by aggregation",
  },
];

const PIPELINE = [
  { agent: "VERGIL", act: "plans", color: "text-ember" },
  { agent: "NERO", act: "executes", color: "text-spectral" },
  { agent: "LADY", act: "judges", color: "text-crimson" },
  { agent: "TRISH", act: "remembers", color: "text-arcane" },
] as const;

export default function Landing() {
  return (
    <main className="console-atmosphere min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex min-h-[82vh] max-w-5xl flex-col justify-center px-6 pt-16">
          <p className="font-mono text-xs tracking-[0.35em] text-mist">
            MODEL CONTEXT PROTOCOL · MULTI-AGENT · REFLEXION
          </p>
          <h1
            className="glitch font-display mt-5 w-fit text-6xl font-bold italic tracking-tight text-bone sm:text-8xl"
            data-text="NERO"
          >
            NERO
          </h1>
          <p className="font-display mt-2 max-w-2xl text-lg text-spectral sm:text-xl">
            Neural Executive &amp; Reasoning Orchestrator
          </p>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist">
            A planner → executor → critic agent system on the Model Context
            Protocol. It plans with schemas, executes with tools, judges its
            own work with an external rubric, and retries with stored
            reflections — under a hard token budget, with every step streamed
            to a live graph.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/run"
              className="press sheen font-display cut-sm border border-spectral bg-spectral/10 px-8 py-3 text-sm font-semibold tracking-widest text-spectral hover:bg-spectral/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-spectral"
            >
              OPEN THE CONSOLE
            </Link>
            <a
              href="https://github.com"
              className="font-mono text-xs text-mist underline-offset-4 transition hover:text-bone hover:underline"
            >
              source on github ↗
            </a>
          </div>

          {/* Pipeline strip with traveling pulse */}
          <div className="pulse-track mt-14 max-w-3xl border-y border-edge py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {PIPELINE.map((p, i) => (
                <span key={p.agent} className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold italic">
                    <span className={p.color}>{p.agent}</span>{" "}
                    <span className="font-mono text-[10px] font-normal not-italic text-mist">
                      {p.act}
                    </span>
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <span className="text-edge" aria-hidden>
                      ▸
                    </span>
                  )}
                </span>
              ))}
              <span className="font-mono ml-auto text-[10px] tracking-widest text-mist">
                FAIL? ↻ RETRY ≤3 · BUDGET-CAPPED
              </span>
            </div>
          </div>

          <div className="reveal mt-8 grid max-w-2xl grid-cols-1 gap-px border border-edge bg-edge font-mono text-xs sm:grid-cols-3">
            {[
              ["provider-agnostic", "anthropic · openai · google · groq"],
              ["hard guardrails", "token budget + attempt ceiling"],
              ["measured", "20-task eval suite w/ ablation"],
            ].map(([k, v]) => (
              <div key={k} className="row-int bg-void p-4 hover:bg-panel">
                <p className="text-spectral">{k}</p>
                <p className="mt-1 leading-relaxed text-mist">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The crew ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="font-display text-sm font-semibold tracking-[0.3em] text-mist">
          THE CREW — ONE RUN, FOUR AGENTS
        </h2>
        <div className="reveal mt-8 grid gap-4 sm:grid-cols-2">
          {AGENTS.map((a) => (
            <CutPanel
              key={a.name}
              accent={a.accent}
              interactive
              bodyClassName="p-6"
            >
              <p className={`font-display text-xl font-bold italic ${a.color}`}>
                {a.name}
              </p>
              <p className="font-mono mt-1 text-xs tracking-widest text-mist">
                {a.role.toUpperCase()}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-bone/80">
                {a.desc}
              </p>
              <p className="font-mono mt-4 border-t border-edge pt-3 text-[10px] text-mist">
                ⚒ {a.weapon}
              </p>
            </CutPanel>
          ))}
        </div>
      </section>

      {/* ── The arsenal ──────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="font-display text-sm font-semibold tracking-[0.3em] text-mist">
          THE ARSENAL — REAL MCP SERVERS AT /api/mcp
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-mist">
          Tools are defined once and exposed both in-process and as a genuine
          Streamable-HTTP MCP server — point Claude Desktop or Cursor at this
          deployment and use the same arsenal.
        </p>
        <div className="mt-8 space-y-px border border-edge bg-edge">
          {ARSENAL.map((t) => (
            <div
              key={t.server}
              className="row-int grid gap-2 bg-panel p-5 hover:bg-panel/60 sm:grid-cols-[160px_220px_1fr] sm:items-baseline"
            >
              <p className="font-display text-sm font-semibold text-spectral">
                {t.server}
              </p>
              <p className="font-mono text-xs text-bone/70">{t.tools}</p>
              <p className="text-sm text-mist">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-edge px-6 py-8">
        <p className="font-mono mx-auto max-w-5xl text-xs text-mist">
          NERO · built on Next.js, Vercel AI SDK &amp; the Model Context
          Protocol · the mission continues
        </p>
      </footer>
    </main>
  );
}
