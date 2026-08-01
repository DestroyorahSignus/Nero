"use client";

import type { MetricsData } from "@/ai/types";

const fmt = (n: number): string => n.toLocaleString();

/** Per-run observability: tokens, cost ceiling, latency, call counts, budget burn. */
export function MetricsPanel({ metrics }: { metrics: MetricsData | null }) {
  const m = metrics ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estCostUsd: 0,
    elapsedMs: 0,
    llmCalls: 0,
    toolCalls: 0,
    budgetTokens: Number(process.env.NEXT_PUBLIC_NERO_TOKEN_BUDGET ?? 150000),
  };
  const burn = Math.min(100, (m.totalTokens / Math.max(1, m.budgetTokens)) * 100);

  const cells: [string, string][] = [
    ["tokens in", fmt(m.inputTokens)],
    ["tokens out", fmt(m.outputTokens)],
    ["llm calls", fmt(m.llmCalls)],
    ["tool calls", fmt(m.toolCalls)],
    ["elapsed", `${(m.elapsedMs / 1000).toFixed(1)}s`],
    ["est. cost ≤", `$${m.estCostUsd.toFixed(4)}`],
  ];

  return (
    <div className="lift border border-edge bg-panel">
      <div className="grid grid-cols-3 gap-px bg-edge">
        {cells.map(([k, v]) => (
          <div key={k} className="bg-panel p-3">
            <p className="font-mono text-[9px] tracking-[0.2em] text-mist">
              {k.toUpperCase()}
            </p>
            <p className="font-mono mt-1 text-sm text-bone">{v}</p>
          </div>
        ))}
      </div>
      <div className="p-3">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[9px] tracking-[0.2em] text-mist">
            TOKEN BUDGET BURN
          </p>
          <p className="font-mono text-[9px] text-mist">
            {fmt(m.totalTokens)} / {fmt(m.budgetTokens)}
          </p>
        </div>
        <div className="mt-2 h-1.5 bg-edge" role="progressbar" aria-valuenow={Math.round(burn)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full transition-all ${burn > 85 ? "bg-crimson" : "bg-spectral"}`}
            style={{ width: `${burn}%` }}
          />
        </div>
      </div>
    </div>
  );
}
