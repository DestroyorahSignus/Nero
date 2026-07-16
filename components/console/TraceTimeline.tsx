"use client";

import { useState } from "react";
import type {
  AgentStepData,
  ToolCallData,
  ReflectionData,
} from "@/ai/types";

type TraceEntry =
  | { kind: "agent"; key: string; data: AgentStepData }
  | { kind: "tool"; key: string; data: ToolCallData }
  | { kind: "reflection"; key: string; data: ReflectionData };

const clip = (v: unknown, n = 400): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s && s.length > n ? s.slice(0, n) + "…" : (s ?? "");
};

/** LangSmith-style step trace: every agent transition, tool call and reflection. */
export function TraceTimeline({ entries }: { entries: TraceEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p className="font-mono p-4 text-xs text-mist">
        Trace is empty. Give NERO a mission to see every step land here.
      </p>
    );
  }

  return (
    <ol className="panel-scroll max-h-80 space-y-px overflow-y-auto">
      {entries.map((e) => {
        const isOpen = open === e.key;
        if (e.kind === "agent") {
          const c =
            e.data.status === "failed"
              ? "text-crimson"
              : e.data.status === "running"
                ? "text-spectral"
                : "text-bone/80";
          return (
            <li key={e.key} className="bg-panel px-4 py-2">
              <p className={`font-mono text-xs ${c}`}>
                <span className="text-mist">a{e.data.attempt}</span>{" "}
                <span className="font-semibold">{e.data.agent}</span> ·{" "}
                {e.data.label} · {e.data.status}
                {e.data.detail ? ` · ${e.data.detail}` : ""}
              </p>
            </li>
          );
        }
        if (e.kind === "reflection") {
          return (
            <li key={e.key} className="border-l-2 border-arcane bg-panel px-4 py-2">
              <p className="font-mono text-xs text-arcane">
                ↻ reflection stored (attempt {e.data.attempt})
              </p>
              <p className="mt-1 text-xs leading-relaxed text-bone/70">
                {e.data.reflection}
              </p>
            </li>
          );
        }
        const t = e.data;
        return (
          <li key={e.key} className="bg-panel px-4 py-2">
            <button
              onClick={() => setOpen(isOpen ? null : e.key)}
              className="font-mono w-full text-left text-xs text-bone/80 transition hover:text-spectral focus-visible:outline focus-visible:outline-1 focus-visible:outline-spectral"
              aria-expanded={isOpen}
            >
              <span className="text-mist">a{t.attempt}</span>{" "}
              <span className="text-spectral">⚒ {t.toolName}</span> · {t.status}
              {typeof t.latencyMs === "number" ? ` · ${t.latencyMs}ms` : ""}
              <span className="float-right text-mist">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="font-mono mt-2 space-y-2 text-[10px] leading-relaxed">
                <div>
                  <p className="text-mist">input</p>
                  <pre className="panel-scroll mt-1 overflow-x-auto bg-void p-2 text-bone/70">
                    {clip(t.input)}
                  </pre>
                </div>
                {t.output !== undefined && (
                  <div>
                    <p className="text-mist">output</p>
                    <pre className="panel-scroll mt-1 overflow-x-auto bg-void p-2 text-bone/70">
                      {clip(t.output)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export type { TraceEntry };
