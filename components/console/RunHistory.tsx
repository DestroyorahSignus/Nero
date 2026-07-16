"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunRecord } from "@/lib/memory/trish";

const rankColor = (rank: string): string =>
  rank.startsWith("S") ? "text-spectral" : rank === "A" || rank === "B" ? "text-ember" : "text-crimson";

const ago = (t: number): string => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

/** TRISH's long-term memory rendered as a mission log. */
export function RunHistory({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) {
        const data = (await res.json()) as { runs: RunRecord[] };
        setRuns(data.runs);
      }
    } catch {
      // history is a nice-to-have; stay quiet on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return <p className="font-mono p-4 text-xs text-mist">Reading TRISH&apos;s memory…</p>;
  }
  if (runs.length === 0) {
    return (
      <p className="font-mono p-4 text-xs leading-relaxed text-mist">
        No missions on record yet. Completed runs land here — durable when
        Upstash is connected, per-instance otherwise.
      </p>
    );
  }
  return (
    <ol className="panel-scroll max-h-64 divide-y divide-edge overflow-y-auto">
      {runs.map((r) => (
        <li key={`${r.sessionId}-${r.at}`} className="flex items-center gap-3 px-4 py-2.5">
          <span
            className={`font-display w-9 shrink-0 text-lg font-bold italic ${rankColor(r.rank)}`}
          >
            {r.rank}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-bone/85">{r.goal}</p>
            <p className="font-mono mt-0.5 text-[9px] text-mist">
              {r.score}/100 · {r.attempts} attempt{r.attempts === 1 ? "" : "s"} ·{" "}
              {r.totalTokens.toLocaleString()} tok · {(r.elapsedMs / 1000).toFixed(1)}s · {ago(r.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
