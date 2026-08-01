import Link from "next/link";
import { CutPanel } from "@/components/ui/CutPanel";

const AGENTS = [
  {
    idx: "01",
    name: "VERGIL",
    role: "Planner",
    weapon: "generateObject + Zod PlanSchema",
    color: "text-ember",
    accent: "var(--color-ember)",
    desc: "Decomposes the goal into a schema-validated plan with checkable success criteria, then steps back. Never executes.",
  },
  {
    idx: "02",
    name: "NERO",
    role: "Executor",
    weapon: "ToolLoopAgent · stopWhen stepCountIs(12)",
    color: "text-spectral",
    accent: "var(--color-spectral)",
    desc: "Carries the plan out with MCP tools — search, fetch, sandboxed code, data analysis — streaming every call live.",
  },
  {
    idx: "03",
    name: "LADY",
    role: "Critic",
    weapon: "LLM-as-judge rubric · external signal",
    color: "text-crimson",
    accent: "var(--color-crimson)",
    desc: "Judges task completion, tool usage, grounding. Fails plausible-but-unverified answers on principle.",
  },
  {
    idx: "04",
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
    desc: "Web reconnaissance over Tavily, with honest degradation when unconfigured.",
  },
  {
    server: "NICO",
    tools: "run_js",
    desc: "Isolated JavaScript execution — 2s CPU wall, zero ambient authority.",
  },
  {
    server: "KALINA ANN",
    tools: "csv_describe · csv_aggregate",
    desc: "Deterministic dataset profiling and group-by aggregation.",
  },
];

const PIPELINE = [
  { step: "01", agent: "VERGIL", act: "plans", color: "text-ember", accent: "var(--color-ember)", detail: "schema-validated steps" },
  { step: "02", agent: "NERO", act: "executes", color: "text-spectral", accent: "var(--color-spectral)", detail: "MCP tools, streamed live" },
  { step: "03", agent: "LADY", act: "judges", color: "text-crimson", accent: "var(--color-crimson)", detail: "rubric, external signal" },
  { step: "04", agent: "TRISH", act: "reflects", color: "text-arcane", accent: "var(--color-arcane)", detail: "stored, then retry ≤3" },
] as const;

const STATS = [
  ["4", "agents", "plan · execute · judge · remember"],
  ["5", "MCP tools", "search · fetch · run_js · csv ×2"],
  ["20", "eval tasks", "programmatic checks + ablation"],
  ["4", "providers", "anthropic · openai · google · groq"],
] as const;

export default function Landing() {
  return (
    <main className="relative min-h-screen">
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 border-b border-edge/60 bg-void/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-display text-lg font-bold italic tracking-tight text-bone">
            NERO<span className="text-spectral">▮</span>
          </span>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com"
              className="font-mono text-[11px] tracking-widest text-mist transition-colors hover:text-bone"
            >
              github
            </a>
            <Link
              href="/run"
              className="press sheen font-display cut-sm border border-spectral/70 bg-spectral/10 px-4 py-1.5 text-[11px] font-semibold tracking-widest text-spectral hover:bg-spectral/25"
            >
              OPEN CONSOLE
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center px-6 pt-16">
        <p className="font-mono text-xs tracking-[0.35em] text-mist">
          MODEL CONTEXT PROTOCOL · MULTI-AGENT · REFLEXION
        </p>
        <h1
          className="glitch nero-live font-display mt-5 w-fit text-7xl font-bold italic tracking-tight sm:text-9xl"
          data-text="NERO"
        >
          NERO
        </h1>
        <p className="font-display mt-3 max-w-2xl text-xl text-spectral sm:text-2xl">
          Neural Executive &amp; Reasoning Orchestrator
        </p>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
          A planner, executor and critic agent system on the Model Context
          Protocol. It plans with schemas, executes with real tools, judges its
          own work against an external rubric, and retries with stored
          reflections — under a hard token budget, every step streamed to a
          live graph.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/run"
            className="press sheen font-display cut-sm border border-spectral bg-spectral/10 px-8 py-3 text-sm font-semibold tracking-widest text-spectral hover:bg-spectral/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-spectral"
          >
            OPEN THE CONSOLE
          </Link>
          <Link
            href="/run"
            className="chip-int press font-mono cut-sm border border-edge px-6 py-3 text-xs tracking-widest text-mist hover:border-spectral/50 hover:text-bone"
          >
            RUN A SAMPLE MISSION
          </Link>
        </div>

        {/* Stats band */}
        <div className="reveal mt-16 grid grid-cols-2 gap-px border border-edge bg-edge sm:grid-cols-4">
          {STATS.map(([n, label, sub]) => (
            <div key={label} className="row-int bg-void/80 p-5">
              <p className="font-display text-3xl font-bold italic text-spectral">
                {n}
              </p>
              <p className="font-mono mt-1 text-[11px] uppercase tracking-widest text-bone/80">
                {label}
              </p>
              <p className="font-mono mt-1 text-[10px] leading-relaxed text-mist">
                {sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pipeline ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-sm font-semibold tracking-[0.3em] text-mist">
          HOW ONE RUN WORKS
        </h2>
        <div className="reveal mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((p) => (
            <CutPanel key={p.agent} accent={p.accent} interactive bodyClassName="p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] tracking-widest text-mist">
                  {p.step}
                </span>
                <span className={`font-display text-xs font-bold italic ${p.color}`}>
                  {p.act}
                </span>
              </div>
              <p className={`font-display mt-3 text-lg font-bold italic ${p.color}`}>
                {p.agent}
              </p>
              <p className="font-mono mt-1 text-[10px] leading-relaxed text-mist">
                {p.detail}
              </p>
            </CutPanel>
          ))}
        </div>
        <p className="font-mono mt-5 text-[11px] tracking-widest text-mist">
          FAIL? ↻ RETRY ≤ 3 · HARD TOKEN BUDGET · HITL APPROVAL GATE
        </p>
      </section>

      {/* ── The crew ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-4">
        <h2 className="font-display text-sm font-semibold tracking-[0.3em] text-mist">
          THE CREW — ONE RUN, FOUR AGENTS
        </h2>
        <div className="reveal mt-8 grid gap-4 sm:grid-cols-2">
          {AGENTS.map((a) => (
            <CutPanel key={a.name} accent={a.accent} interactive bodyClassName="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className={`font-display text-2xl font-bold italic ${a.color}`}>
                    {a.name}
                  </p>
                  <p className="font-mono mt-1 text-xs tracking-widest text-mist">
                    {a.role.toUpperCase()}
                  </p>
                </div>
                <span className="font-mono text-xs tracking-widest text-mist/60">
                  {a.idx}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-bone/80">{a.desc}</p>
              <p className="font-mono mt-5 border-t border-edge pt-3 text-[10px] tracking-wide text-mist">
                {a.weapon}
              </p>
            </CutPanel>
          ))}
        </div>
      </section>

      {/* ── The arsenal ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-sm font-semibold tracking-[0.3em] text-mist">
          THE ARSENAL — REAL MCP SERVERS AT /api/mcp
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">
          Tools are defined once and exposed both in-process and as a genuine
          Streamable-HTTP MCP server — point Claude Desktop or Cursor at this
          deployment and use the same arsenal.
        </p>
        <div className="reveal mt-8 grid gap-4 sm:grid-cols-3">
          {ARSENAL.map((t) => (
            <CutPanel key={t.server} interactive bodyClassName="p-5">
              <p className="font-display text-sm font-semibold tracking-wide text-spectral">
                {t.server}
              </p>
              <p className="font-mono mt-2 text-xs text-bone/70">{t.tools}</p>
              <p className="mt-3 text-sm leading-relaxed text-mist">{t.desc}</p>
            </CutPanel>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <CutPanel accent="var(--color-spectral)" interactive bodyClassName="p-10 text-center">
          <p className="font-display text-2xl font-bold italic text-bone sm:text-3xl">
            Deploy the crew.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mist">
            Give NERO a goal — a computation, a dataset, or a URL to
            investigate — and watch the plan, tools, verdict and reflexion land
            on a live graph, in real time.
          </p>
          <Link
            href="/run"
            className="press sheen font-display cut-sm mt-7 inline-block border border-spectral bg-spectral/10 px-8 py-3 text-sm font-semibold tracking-widest text-spectral hover:bg-spectral/25"
          >
            OPEN THE CONSOLE
          </Link>
        </CutPanel>
      </section>

      <footer className="border-t border-edge px-6 py-8">
        <p className="font-mono mx-auto max-w-6xl text-xs text-mist">
          NERO · built on Next.js, the Vercel AI SDK &amp; the Model Context
          Protocol · the mission continues
        </p>
      </footer>
    </main>
  );
}
