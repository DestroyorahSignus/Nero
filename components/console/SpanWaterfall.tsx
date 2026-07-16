"use client";

import type { SpanData } from "@/ai/types";

const ROLE_COLOR: Record<SpanData["role"], string> = {
  planner: "bg-ember",
  executor: "bg-spectral",
  critic: "bg-crimson",
};

/**
 * Per-phase observability: wall-clock waterfall of VERGIL/NERO/LADY spans
 * with token counts — a trace view without leaving the console.
 */
export function SpanWaterfall({ spans }: { spans: SpanData[] }) {
  if (spans.length === 0) {
    return (
      <p className="font-mono p-4 text-xs text-mist">
        Phase spans land here — wall-clock and token cost per agent, per attempt.
      </p>
    );
  }
  const total = Math.max(...spans.map((s) => s.startMs + s.durMs), 1);

  return (
    <div className="space-y-1.5 p-4">
      {spans.map((s) => (
        <div key={`${s.role}-${s.attempt}-${s.startMs}`}>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[9px] tracking-wider text-mist">
              a{s.attempt} · {s.label}
            </p>
            <p className="font-mono text-[9px] text-bone/70">
              {(s.durMs / 1000).toFixed(1)}s · {s.tokens.toLocaleString()} tok
            </p>
          </div>
          <div className="mt-0.5 h-2 w-full bg-edge/50">
            <div
              className={`h-full ${ROLE_COLOR[s.role]} opacity-80`}
              style={{
                marginLeft: `${(s.startMs / total) * 100}%`,
                width: `${Math.max(1.5, (s.durMs / total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
