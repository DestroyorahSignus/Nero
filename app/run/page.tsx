"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { NeroUIMessage } from "@/ai/types";
import { AgentGraph } from "@/components/graph/AgentGraph";
import { StyleRank } from "@/components/console/StyleRank";
import { MetricsPanel } from "@/components/console/MetricsPanel";
import { PlanChecklist } from "@/components/console/PlanChecklist";
import { PhaseTracker } from "@/components/console/PhaseTracker";
import { ComboMeter } from "@/components/console/ComboMeter";
import { RunHistory } from "@/components/console/RunHistory";
import { CutPanel } from "@/components/ui/CutPanel";
import { KeyVault, readVault } from "@/components/console/KeyVault";
import { TraceTimeline } from "@/components/console/TraceTimeline";
import { SpanWaterfall } from "@/components/console/SpanWaterfall";
import { ApprovalCard } from "@/components/console/ApprovalCard";
import { deriveConsoleState } from "@/lib/derive";

const MISSIONS = [
  "Compute the 40th Fibonacci number exactly",
  "Fetch https://example.com and report its main heading",
  "Which region wins on revenue? region,units,revenue\\nNorth,120,24000\\nSouth,80,16000\\nWest,140,28000",
];

interface DeployStatus {
  provider: string;
  serverKeyConfigured: boolean;
  models: { planner: string; executor: string; critic: string };
  yamatoMode: string;
  budgetTokens: number;
  searchConfigured: boolean;
  memoryDurable: boolean;
}

export default function RunConsole() {
  const [goal, setGoal] = useState("");
  const [deploy, setDeploy] = useState<DeployStatus | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  const [hasClientKey, setHasClientKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasClientKey(Boolean(readVault().apiKey));
    setSafeMode(window.sessionStorage.getItem("nero-safemode") !== "0");
  }, []);

  const toggleSafeMode = () => {
    setSafeMode((v) => {
      window.sessionStorage.setItem("nero-safemode", v ? "0" : "1");
      return !v;
    });
  };

  const [chatId] = useState(() => crypto.randomUUID());
  const { messages, sendMessage, status, error } = useChat<NeroUIMessage>({
    id: chatId,
    transport: new DefaultChatTransport({
      api: "/api/agent",
      // Resolved fresh on every request: BYOK keys ride as headers,
      // straight from sessionStorage — nothing baked into the transport.
      headers: () => {
        const v = readVault();
        const h: Record<string, string> = {};
        if (v.apiKey) h["x-nero-api-key"] = v.apiKey;
        if (v.provider) h["x-nero-provider"] = v.provider;
        if (v.tavilyKey) h["x-nero-tavily-key"] = v.tavilyKey;
        h["x-nero-approval"] =
          window.sessionStorage.getItem("nero-safemode") !== "0" ? "on" : "off";
        return h;
      },
    }),
  });

  const running = status === "submitted" || status === "streaming";

  // Deployment status for the header chips
  useEffect(() => {
    void fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DeployStatus | null) => d && setDeploy(d))
      .catch(() => {});
  }, []);

  // Keyboard: "/" focuses the mission input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One shared fold: parts -> console state (same function powers replay).
  const state = useMemo(() => deriveConsoleState(messages), [messages]);

  // Refresh the mission log when a run reaches a terminal phase
  const phase = state.runStatus?.phase;
  useEffect(() => {
    if (phase === "done" || phase === "failed" || phase === "budget_exceeded") {
      const t = setTimeout(() => setHistoryKey((k) => k + 1), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const launch = (g: string) => {
    const text = g.trim();
    if (!text || running) return;
    setGoal("");
    void sendMessage({ text });
  };

  const terminal =
    phase === "done" || phase === "failed" || phase === "budget_exceeded";
  const streamError = status === "error" ? error : undefined;

  return (
    <main className="console-atmosphere min-h-screen pb-16">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="border-b border-edge px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="font-display text-lg font-bold italic text-bone"
          >
            NERO<span className="text-spectral">▮</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {deploy && (
              <>
                <Chip label="LLM" value={deploy.provider} accent="text-spectral" />
                <Chip label="YAMATO" value={deploy.yamatoMode} accent="text-arcane" />
                <Chip
                  label="SEARCH"
                  value={deploy.searchConfigured ? "armed" : "offline"}
                  accent={deploy.searchConfigured ? "text-spectral" : "text-mist"}
                />
                <Chip
                  label="MEMORY"
                  value={deploy.memoryDurable ? "durable" : "volatile"}
                  accent={deploy.memoryDurable ? "text-spectral" : "text-mist"}
                />
              </>
            )}
            <Chip
              label="KEY"
              value={hasClientKey ? "client" : deploy?.serverKeyConfigured ? "server" : "missing"}
              accent={
                hasClientKey || deploy?.serverKeyConfigured
                  ? "text-spectral"
                  : "text-crimson"
              }
            />
            <button
              onClick={toggleSafeMode}
              title="Safe mode gates run_js behind operator approval"
              className={`font-mono cut-sm border px-2 py-1 text-[9px] tracking-widest transition ${
                safeMode
                  ? "border-ember/60 bg-ember/10 text-ember"
                  : "border-edge text-mist hover:text-bone"
              }`}
            >
              SAFE MODE {safeMode ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => setVaultOpen(true)}
              className="font-display cut-sm border border-spectral/60 bg-spectral/5 px-3 py-1 text-[10px] font-semibold tracking-widest text-spectral transition hover:bg-spectral/20"
            >
              KEYS
            </button>
            <p className="font-mono hidden text-[10px] tracking-[0.2em] text-mist md:block">
              {running ? "● LIVE" : "READY"}
            </p>
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-6xl">
          <PhaseTracker status={state.runStatus} />
        </div>
      </header>

      {/* ── Mission input ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="goal"
            className="font-mono text-[10px] tracking-[0.3em] text-mist"
          >
            MISSION BRIEFING
          </label>
          <p className="font-mono hidden text-[9px] text-mist/70 sm:block">
            press <kbd className="border border-edge px-1">/</kbd> to focus ·{" "}
            <kbd className="border border-edge px-1">Enter</kbd> to deploy
          </p>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            id="goal"
            ref={inputRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && launch(goal)}
            placeholder="Give the crew a goal — computation, data, or a URL to investigate"
            disabled={running}
            className="cut-sm w-full border border-edge bg-panel px-4 py-3 text-sm text-bone placeholder:text-mist focus:border-spectral focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => launch(goal)}
            disabled={running || !goal.trim()}
            className="font-display cut-sm shrink-0 border border-spectral bg-spectral/10 px-6 text-sm font-semibold tracking-widest text-spectral transition hover:bg-spectral/25 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-spectral"
          >
            {running ? "RUNNING…" : "DEPLOY"}
          </button>
        </div>
        {!hasClientKey && deploy && !deploy.serverKeyConfigured && (
          <p className="font-mono mt-3 border-l-2 border-ember pl-3 text-[10px] leading-relaxed text-ember">
            No API key on this deployment — missions will fail. Hit{" "}
            <button
              onClick={toggleSafeMode}
              title="Safe mode gates run_js behind operator approval"
              className={`font-mono cut-sm border px-2 py-1 text-[9px] tracking-widest transition ${
                safeMode
                  ? "border-ember/60 bg-ember/10 text-ember"
                  : "border-edge text-mist hover:text-bone"
              }`}
            >
              SAFE MODE {safeMode ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => setVaultOpen(true)}
              className="underline underline-offset-2 hover:text-bone"
            >
              KEYS
            </button>{" "}
            to add your own (stays in this tab, never stored server-side).
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSIONS.map((m) => (
            <button
              key={m}
              onClick={() => launch(m.replaceAll("\\n", "\n"))}
              disabled={running}
              className="font-mono cut-sm border border-edge px-3 py-1.5 text-[10px] text-mist transition hover:border-spectral hover:text-spectral disabled:opacity-40"
            >
              {m.length > 60 ? m.slice(0, 60) + "…" : m}
            </button>
          ))}
        </div>
      </section>

      {/* ── Stream error banner: a failed run must NEVER look frozen ── */}
      {streamError && (
        <section className="mx-auto max-w-6xl px-6 pt-6">
          <div className="banner-slam cut border border-crimson bg-crimson/10 px-5 py-3" role="alert">
            <p className="font-display text-lg font-bold italic tracking-wide text-crimson">
              RUN ERROR
            </p>
            <p className="font-mono mt-0.5 text-[10px] leading-relaxed tracking-wider text-bone/80">
              {streamError.message || "The run failed before completing."}
            </p>
            <p className="font-mono mt-1 text-[9px] text-mist">
              Common causes: invalid/expired API key (check KEYS), a
              decommissioned model id on the provider, or a provider outage.
              Retry after fixing — the console resets on the next deploy.
            </p>
          </div>
        </section>
      )}

      {/* ── Mission banner ───────────────────────────────────── */}
      {terminal && state.runStatus && (
        <section className="mx-auto max-w-6xl px-6 pt-6">
          <div
            key={phase}
            className={`banner-slam cut border px-5 py-3 ${
              phase === "done"
                ? "border-spectral bg-spectral/10"
                : phase === "budget_exceeded"
                  ? "border-ember bg-ember/10"
                  : "border-crimson bg-crimson/10"
            }`}
            role="status"
          >
            <p
              className={`font-display text-lg font-bold italic tracking-wide ${
                phase === "done"
                  ? "text-spectral"
                  : phase === "budget_exceeded"
                    ? "text-ember"
                    : "text-crimson"
              }`}
            >
              {phase === "done"
                ? "MISSION COMPLETE"
                : phase === "budget_exceeded"
                  ? "BUDGET WALL HIT"
                  : "MISSION FAILED"}
            </p>
            <p className="font-mono mt-0.5 text-[10px] tracking-wider text-mist">
              {state.runStatus.message}
            </p>
            <ShareReplay sessionId={chatId} />
          </div>
        </section>
      )}

      {/* ── Pending approvals ────────────────────────────────── */}
      {state.approvals.some((a) => a.data.status === "pending") && (
        <section className="mx-auto max-w-6xl space-y-3 px-6 pt-6">
          {state.approvals
            .filter((a) => a.data.status === "pending")
            .map((a) => (
              <ApprovalCard key={a.id} id={a.id} data={a.data} />
            ))}
        </section>
      )}

      {/* ── Console grid ─────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CutPanel accent={running ? "var(--color-spectral)" : "var(--color-edge)"}>
            <PanelTitle>AGENT GRAPH — LIVE</PanelTitle>
            <AgentGraph
              agentSteps={state.agentSteps}
              toolCalls={state.toolCalls}
            />
          </CutPanel>

          <CutPanel>
            <PanelTitle>TRACE</PanelTitle>
            <TraceTimeline entries={state.trace} />
          </CutPanel>

          <CutPanel accent={terminal && phase === "done" ? "var(--color-spectral)" : "var(--color-edge)"}>
            <PanelTitle>FINAL ANSWER</PanelTitle>
            <div className="p-4">
              {state.finalText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-bone/90">
                  {state.finalText}
                </p>
              ) : (
                <p className="font-mono text-xs text-mist">
                  The executor&apos;s answer streams in here, token by token.
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

          <CutPanel bodyClassName="p-3">
            <ComboMeter eventCount={state.eventCount} running={running} />
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

          <CutPanel>
            <PanelTitle>MISSION LOG — TRISH</PanelTitle>
            <RunHistory refreshKey={historyKey} />
          </CutPanel>
        </aside>
      </section>

      <KeyVault
        open={vaultOpen}
        onClose={() => setVaultOpen(false)}
        onChange={setHasClientKey}
      />
    </main>
  );
}

function ShareReplay({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}/run/${sessionId}`;
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="font-mono mt-2 text-[9px] tracking-widest text-mist underline-offset-2 hover:text-bone hover:underline"
    >
      {copied ? "REPLAY LINK COPIED ✓" : "⎘ COPY REPLAY PERMALINK"}
    </button>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono border-b border-edge px-4 py-2 text-[10px] tracking-[0.3em] text-mist">
      {children}
    </p>
  );
}

function Chip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <span className="font-mono cut-sm border border-edge bg-panel px-2 py-1 text-[9px] tracking-widest text-mist">
      {label} <span className={accent}>{value.toUpperCase()}</span>
    </span>
  );
}
