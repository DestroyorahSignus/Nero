"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { NeroUIMessage } from "@/ai/types";
import { deriveConsoleState, stripMdLite } from "@/lib/derive";
import { AgentGraph } from "@/components/graph/AgentGraph";
import { StyleRank } from "@/components/console/StyleRank";
import { MetricsPanel } from "@/components/console/MetricsPanel";
import { PlanChecklist } from "@/components/console/PlanChecklist";
import { SpanWaterfall } from "@/components/console/SpanWaterfall";
import { TraceTimeline } from "@/components/console/TraceTimeline";
import { CutPanel } from "@/components/ui/CutPanel";

/**
 * The replay console: identical panels to the live console, driven by the
 * identical derivation — just folded over a persisted snapshot instead of a
 * live stream. Zero API calls, zero cost to view.
 */
export function ReplayConsole({
  messages,
  sessionId,
}: {
  messages: NeroUIMessage[];
  sessionId: string;
}) {
  const state = useMemo(() => deriveConsoleState(messages), [messages]);
  const goal =
    messages
      .find((m) => m.role === "user")
      ?.parts.map((p) => (p.type === "text" ? p.text : ""))
      .join("") ?? "";

  return (
    <main className="console-atmosphere min-h-screen pb-16">
      <header className="border-b border-edge px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="font-display text-lg font-bold italic text-bone"
          >
            NERO<span className="text-spectral">▮</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-mono cut-sm border border-arcane/60 bg-arcane/10 px-2 py-1 text-[9px] tracking-widest text-arcane">
              ⟲ REPLAY · {sessionId.slice(0, 8)}
            </span>
            <Link
              href="/run"
              className="font-display cut-sm border border-spectral/60 bg-spectral/5 px-3 py-1 text-[10px] font-semibold tracking-widest text-spectral transition hover:bg-spectral/20"
            >
              NEW MISSION
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-8">
        <p className="font-mono text-[10px] tracking-[0.3em] text-mist">
          MISSION BRIEFING (RECORDED)
        </p>
        <p className="cut-sm mt-2 border border-edge bg-panel px-4 py-3 text-sm text-bone/85">
          {goal || "—"}
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CutPanel>
            <PanelTitle>AGENT GRAPH — RECORDED</PanelTitle>
            <AgentGraph
              agentSteps={state.agentSteps}
              toolCalls={state.toolCalls}
            />
          </CutPanel>

          <CutPanel>
            <PanelTitle>TRACE</PanelTitle>
            <TraceTimeline entries={state.trace} />
          </CutPanel>

          <CutPanel
            accent={
              state.runStatus?.phase === "done"
                ? "var(--color-spectral)"
                : "var(--color-edge)"
            }
          >
            <PanelTitle>FINAL ANSWER</PanelTitle>
            <div className="p-4">
              {state.finalText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-bone/90">
                  {stripMdLite(state.finalText)}
                </p>
              ) : (
                <p className="font-mono text-xs text-mist">
                  No answer was recorded for this run.
                </p>
              )}
              {state.verdict && !state.verdict.pass && state.finalText && (
                <p className="font-mono mt-3 border-l-2 border-crimson pl-3 text-[10px] leading-relaxed text-crimson/90">
                  LADY&apos;s caveat: {state.verdict.critique}
                </p>
              )}
            </div>
          </CutPanel>
        </div>

        <aside className="space-y-4">
          <CutPanel
            accent={
              state.verdict
                ? state.verdict.pass
                  ? "var(--color-spectral)"
                  : "var(--color-crimson)"
                : "var(--color-edge)"
            }
          >
            <StyleRank verdict={state.verdict} />
          </CutPanel>

          <MetricsPanel metrics={state.metrics} />

          <CutPanel>
            <PanelTitle>PHASE SPANS</PanelTitle>
            <SpanWaterfall spans={state.spans} />
          </CutPanel>

          <CutPanel>
            <PanelTitle>VERGIL&apos;S PLAN</PanelTitle>
            <PlanChecklist plan={state.plan} />
          </CutPanel>
        </aside>
      </section>
    </main>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono border-b border-edge px-4 py-2 text-[10px] tracking-[0.3em] text-mist">
      {children}
    </p>
  );
}
