"use client";

import type { MetricsData } from "@/ai/types";

/**
 * Always-visible status strip beneath the header: effective provider, live
 * token-budget burn (animates as a run progresses), memory durability,
 * search state, and SAFE MODE. Surfaces /api/status + run metrics at a glance.
 */
export function BudgetStrip({
  provider,
  metrics,
  budgetTokens,
  memoryDurable,
  searchArmed,
  safeMode,
  running,
}: {
  provider: string;
  metrics: MetricsData | null;
  budgetTokens: number;
  memoryDurable: boolean;
  searchArmed: boolean;
  safeMode: boolean;
  running: boolean;
}) {
  const denom = metrics?.budgetTokens || budgetTokens || 150_000;
  const used = metrics?.totalTokens ?? 0;
  const pct = Math.min(100, denom > 0 ? (used / denom) * 100 : 0);
  const near = pct >= 80;

  return (
    <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6">
      <span className="font-mono flex items-center gap-1.5 text-[10px] tracking-widest text-mist">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? "bg-spectral" : "bg-mist"}`}
          aria-hidden
        />
        {provider.toUpperCase()}
      </span>

      <div className="flex min-w-[180px] flex-1 items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-sm bg-edge/60">
          <div
            className={`absolute inset-y-0 left-0 ${near ? "budget-fill-hot" : "combo-fill"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono shrink-0 text-[9px] tracking-widest text-mist">
          {(used / 1000).toFixed(1)}k / {(denom / 1000).toFixed(0)}k
        </span>
      </div>

      <div className="font-mono flex items-center gap-3 text-[9px] tracking-widest">
        <span className={memoryDurable ? "text-spectral" : "text-mist"}>
          MEM {memoryDurable ? "DURABLE" : "VOLATILE"}
        </span>
        <span className={searchArmed ? "text-spectral" : "text-mist"}>
          SEARCH {searchArmed ? "ARMED" : "OFFLINE"}
        </span>
        <span className={safeMode ? "text-ember" : "text-mist"}>
          SAFE {safeMode ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
}
