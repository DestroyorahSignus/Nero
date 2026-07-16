"use client";

import type { RunStatusData } from "@/ai/types";

const PHASES = [
  { key: "planning", label: "PLAN", agent: "VERGIL", color: "text-ember", bar: "bg-ember" },
  { key: "executing", label: "EXECUTE", agent: "NERO", color: "text-spectral", bar: "bg-spectral" },
  { key: "critiquing", label: "JUDGE", agent: "LADY", color: "text-crimson", bar: "bg-crimson" },
] as const;

/** Which pipeline stage the run is in, with the Reflexion loop-back made visible. */
export function PhaseTracker({ status }: { status: RunStatusData | null }) {
  const phase = status?.phase ?? null;
  const activeIdx =
    phase === "planning" ? 0 : phase === "executing" ? 1 : phase === "critiquing" ? 2 : -1;
  const terminal = phase === "done" || phase === "failed" || phase === "budget_exceeded";
  const reflecting = phase === "reflecting";

  return (
    <div className="flex items-stretch gap-1" role="status" aria-label="Run phase">
      {PHASES.map((p, i) => {
        const active = i === activeIdx;
        const passed = terminal || (activeIdx > -1 && i < activeIdx) || reflecting;
        return (
          <div key={p.key} className="flex-1">
            <div
              className={`h-1 ${
                active ? `${p.bar} hazard hazard-run` : passed ? p.bar : "bg-edge"
              }`}
              style={active ? { backgroundColor: "transparent" } : undefined}
            />
            <p
              className={`font-mono mt-1.5 text-[9px] tracking-[0.25em] ${
                active ? p.color : passed ? "text-bone/60" : "text-mist/50"
              }`}
            >
              {p.label}
              <span className="ml-1 hidden sm:inline">· {p.agent}</span>
            </p>
          </div>
        );
      })}
      {reflecting && (
        <p className="font-mono self-center text-[9px] tracking-widest text-arcane">
          ↻ REFLEXION
        </p>
      )}
    </div>
  );
}
