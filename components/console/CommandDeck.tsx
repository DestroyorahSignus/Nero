"use client";

import { useEffect, useState } from "react";
import { CutPanel } from "@/components/ui/CutPanel";
import { MODEL_OPTIONS } from "@/lib/model-catalog";
import type { ProviderId } from "@/lib/providers";

export interface VaultModels {
  planner: string;
  executor: string;
  critic: string;
}

export interface VaultKeys {
  provider: string;
  apiKey: string;
  tavilyKey: string;
  /** Per-role model picks. Empty string = use the server default. */
  models: VaultModels;
}

const STORAGE_KEY = "nero-vault";
const EMPTY_MODELS: VaultModels = { planner: "", executor: "", critic: "" };

/**
 * HTTP headers only permit ISO-8859-1, and real API keys are printable
 * ASCII anyway — strip everything else. Kills the invisible zero-width
 * characters that hitchhike on copy-paste from chat apps and web pages
 * (which String.trim() does NOT remove) before they can break fetch().
 */
const sanitizeKey = (v: string): string => v.replace(/[^\x20-\x7E]/g, "").trim();
const PROVIDERS: ProviderId[] = ["anthropic", "openai", "google", "groq"];
const ROLES = ["planner", "executor", "critic"] as const;

export function readVault(): VaultKeys {
  const empty: VaultKeys = {
    provider: "",
    apiKey: "",
    tavilyKey: "",
    models: { ...EMPTY_MODELS },
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<VaultKeys>;
      const m = v.models ?? EMPTY_MODELS;
      return {
        provider: sanitizeKey(v.provider ?? ""),
        apiKey: sanitizeKey(v.apiKey ?? ""),
        tavilyKey: sanitizeKey(v.tavilyKey ?? ""),
        models: {
          planner: sanitizeKey(m.planner ?? ""),
          executor: sanitizeKey(m.executor ?? ""),
          critic: sanitizeKey(m.critic ?? ""),
        },
      };
    }
  } catch {
    // corrupted entry — treat as empty
  }
  return empty;
}

function writeVault(v: VaultKeys): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

function clearVault(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

const hasAnyModel = (m: VaultModels) => Boolean(m.planner || m.executor || m.critic);

export interface DeployStatus {
  provider: string;
  serverKeyConfigured: boolean;
  models: { planner: string; executor: string; critic: string };
  yamatoMode: string;
  budgetTokens: number;
  searchConfigured: boolean;
  memoryDurable: boolean;
}

/**
 * The Command Deck — the console's single configuration surface.
 *
 * A left slide-in drawer consolidating provider + BYOK keys, SAFE MODE, and
 * a per-role model picker. Keys live in sessionStorage (this tab only, gone
 * when it closes) and ride as headers with each run request; the server uses
 * them for that request only — nothing is persisted or logged server-side.
 */
export function CommandDeck({
  open,
  onClose,
  onChange,
  deploy,
  safeMode,
  onToggleSafeMode,
}: {
  open: boolean;
  onClose: () => void;
  onChange: (hasKey: boolean, provider: string, hasTavily: boolean) => void;
  deploy: DeployStatus | null;
  safeMode: boolean;
  onToggleSafeMode: () => void;
}) {
  const [form, setForm] = useState<VaultKeys>({
    provider: "",
    apiKey: "",
    tavilyKey: "",
    models: { ...EMPTY_MODELS },
  });

  useEffect(() => {
    if (open) setForm(readVault());
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Which provider's model list to offer: the chosen provider, else the
  // server's active provider, else groq as a safe default.
  const effProvider = (form.provider ||
    deploy?.provider ||
    "groq") as ProviderId;
  const modelChoices = MODEL_OPTIONS[effProvider] ?? [];

  const save = () => {
    const trimmed: VaultKeys = {
      provider: sanitizeKey(form.provider),
      apiKey: sanitizeKey(form.apiKey),
      tavilyKey: sanitizeKey(form.tavilyKey),
      models: {
        planner: sanitizeKey(form.models.planner),
        executor: sanitizeKey(form.models.executor),
        critic: sanitizeKey(form.models.critic),
      },
    };
    if (trimmed.apiKey || trimmed.tavilyKey || hasAnyModel(trimmed.models)) {
      writeVault(trimmed);
    } else {
      clearVault();
    }
    onChange(Boolean(trimmed.apiKey), trimmed.provider, Boolean(trimmed.tavilyKey));
    onClose();
  };

  const clear = () => {
    clearVault();
    setForm({ provider: "", apiKey: "", tavilyKey: "", models: { ...EMPTY_MODELS } });
    onChange(false, "", false);
    onClose();
  };

  return (
    <div
      className="deck-backdrop fixed inset-0 z-50 flex bg-void/85"
      role="dialog"
      aria-modal="true"
      aria-label="Command Deck"
      onClick={onClose}
    >
      <aside
        className="deck-slide panel-scroll h-full w-full max-w-sm overflow-y-auto border-r border-spectral/40 bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="deck-item flex items-center justify-between">
            <p className="font-display text-lg font-bold italic text-spectral">
              COMMAND DECK
            </p>
            <button
              onClick={onClose}
              aria-label="Close"
              className="font-mono cut-sm border border-edge px-2 py-1 text-[10px] tracking-widest text-mist transition hover:text-bone"
            >
              ESC ✕
            </button>
          </div>
          <p className="deck-item mt-2 text-[11px] leading-relaxed text-mist">
            Keys stay in <span className="text-bone/80">this browser tab</span>{" "}
            (sessionStorage), ride only with your run requests, and are never
            stored or logged on the server. Close the tab and they&apos;re gone.
          </p>

          {/* ── Provider ─────────────────────────────────────── */}
          <label className="deck-item font-mono mt-5 block text-[10px] tracking-[0.25em] text-mist">
            PROVIDER
          </label>
          <div className="deck-item mt-1.5 grid grid-cols-4 gap-1">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    // Model picks are provider-specific — reset on switch.
                    provider: f.provider === p ? "" : p,
                    models: { ...EMPTY_MODELS },
                  }))
                }
                className={`deck-press font-mono cut-sm border px-2 py-1.5 text-[10px] transition ${
                  form.provider === p
                    ? "border-spectral bg-spectral/15 text-spectral"
                    : "border-edge text-mist hover:border-spectral/50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="deck-item font-mono mt-1 text-[9px] text-mist/70">
            none selected = server&apos;s LLM_PROVIDER
            {deploy ? ` (${deploy.provider})` : ""}
          </p>

          {/* ── Keys ─────────────────────────────────────────── */}
          <label
            htmlFor="deck-key"
            className="deck-item font-mono mt-4 block text-[10px] tracking-[0.25em] text-mist"
          >
            API KEY
          </label>
          <input
            id="deck-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="sk-ant-…  /  sk-…  /  AIza…  /  gsk_…"
            className="deck-item cut-sm mt-1.5 w-full border border-edge bg-void px-3 py-2.5 font-mono text-xs text-bone placeholder:text-mist/50 focus:border-spectral focus:outline-none"
          />

          <label
            htmlFor="deck-tavily"
            className="deck-item font-mono mt-4 block text-[10px] tracking-[0.25em] text-mist"
          >
            TAVILY KEY{" "}
            <span className="text-mist/60">(optional — arms web_search)</span>
          </label>
          <input
            id="deck-tavily"
            type="password"
            autoComplete="off"
            value={form.tavilyKey}
            onChange={(e) => setForm((f) => ({ ...f, tavilyKey: e.target.value }))}
            placeholder="tvly-…"
            className="deck-item cut-sm mt-1.5 w-full border border-edge bg-void px-3 py-2.5 font-mono text-xs text-bone placeholder:text-mist/50 focus:border-spectral focus:outline-none"
          />

          {/* ── Safe mode ────────────────────────────────────── */}
          <div className="deck-item mt-5 flex items-center justify-between border-t border-edge pt-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.25em] text-mist">
                SAFE MODE
              </p>
              <p className="font-mono mt-0.5 text-[9px] text-mist/70">
                gate run_js behind operator approval
              </p>
            </div>
            <button
              onClick={onToggleSafeMode}
              role="switch"
              aria-checked={safeMode}
              className={`deck-press font-mono cut-sm border px-3 py-1.5 text-[10px] tracking-widest transition ${
                safeMode
                  ? "border-ember/60 bg-ember/10 text-ember"
                  : "border-edge text-mist hover:text-bone"
              }`}
            >
              {safeMode ? "ON" : "OFF"}
            </button>
          </div>

          {/* ── Model picker ─────────────────────────────────── */}
          <label className="deck-item font-mono mt-5 block border-t border-edge pt-4 text-[10px] tracking-[0.25em] text-mist">
            MODELS <span className="text-mist/60">— per role ({effProvider})</span>
          </label>
          <div className="deck-item mt-2 space-y-2">
            {ROLES.map((role) => (
              <div key={role} className="flex items-center gap-2">
                <span className="font-mono w-16 shrink-0 text-[9px] uppercase tracking-widest text-mist">
                  {role}
                </span>
                <select
                  value={form.models[role]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      models: { ...f.models, [role]: e.target.value },
                    }))
                  }
                  className="cut-sm w-full border border-edge bg-void px-2 py-1.5 font-mono text-[10px] text-bone focus:border-spectral focus:outline-none"
                >
                  <option value="">default (server)</option>
                  {modelChoices.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="deck-item font-mono mt-1 text-[9px] text-mist/70">
            picks ride as x-nero-&lt;role&gt;-model; unknown ids fall back to default
          </p>

          {/* ── Live status ──────────────────────────────────── */}
          {deploy && (
            <div className="deck-item mt-5 border-t border-edge pt-4">
              <p className="font-mono text-[10px] tracking-[0.25em] text-mist">
                DEPLOYMENT
              </p>
              <dl className="mt-2 space-y-1">
                <StatusRow label="YAMATO" value={deploy.yamatoMode} accent="text-arcane" />
                <StatusRow
                  label="SEARCH"
                  value={deploy.searchConfigured || Boolean(form.tavilyKey) ? "armed" : "offline"}
                  accent={
                    deploy.searchConfigured || Boolean(form.tavilyKey)
                      ? "text-spectral"
                      : "text-mist"
                  }
                />
                <StatusRow
                  label="MEMORY"
                  value={deploy.memoryDurable ? "durable" : "volatile"}
                  accent={deploy.memoryDurable ? "text-spectral" : "text-mist"}
                />
                <StatusRow
                  label="BUDGET"
                  value={`${(deploy.budgetTokens / 1000).toFixed(0)}k tokens`}
                  accent="text-bone/80"
                />
              </dl>
              <p className="font-mono mt-2 text-[9px] leading-relaxed text-mist/60">
                server defaults · {deploy.models.planner}
              </p>
            </div>
          )}

          {/* ── Actions ──────────────────────────────────────── */}
          <div className="deck-item mt-6 flex items-center justify-between gap-2 border-t border-edge pt-4">
            <button
              onClick={clear}
              className="deck-press font-mono cut-sm border border-crimson/50 px-4 py-2 text-[10px] tracking-widest text-crimson transition hover:bg-crimson/10"
            >
              CLEAR
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="deck-press font-mono cut-sm border border-edge px-4 py-2 text-[10px] tracking-widest text-mist transition hover:text-bone"
              >
                CANCEL
              </button>
              <button
                onClick={save}
                className="deck-press font-display cut-sm border border-spectral bg-spectral/10 px-5 py-2 text-xs font-semibold tracking-widest text-spectral transition hover:bg-spectral/25"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function StatusRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-mono text-[9px] tracking-widest text-mist">{label}</dt>
      <dd className={`font-mono text-[10px] ${accent}`}>{value.toUpperCase()}</dd>
    </div>
  );
}
