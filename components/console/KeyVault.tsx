"use client";

import { useEffect, useState } from "react";
import { CutPanel } from "@/components/ui/CutPanel";

export interface VaultKeys {
  provider: string;
  apiKey: string;
  tavilyKey: string;
}

const STORAGE_KEY = "nero-vault";

/**
 * HTTP headers only permit ISO-8859-1, and real API keys are printable
 * ASCII anyway — strip everything else. Kills the invisible zero-width
 * characters that hitchhike on copy-paste from chat apps and web pages
 * (which String.trim() does NOT remove) before they can break fetch().
 */
const sanitizeKey = (v: string): string => v.replace(/[^\x20-\x7E]/g, "").trim();
const PROVIDERS = ["anthropic", "openai", "google", "groq"] as const;

export function readVault(): VaultKeys {
  if (typeof window === "undefined") {
    return { provider: "", apiKey: "", tavilyKey: "" };
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as VaultKeys;
      return {
        provider: sanitizeKey(v.provider ?? ""),
        apiKey: sanitizeKey(v.apiKey ?? ""),
        tavilyKey: sanitizeKey(v.tavilyKey ?? ""),
      };
    }
  } catch {
    // corrupted entry — treat as empty
  }
  return { provider: "", apiKey: "", tavilyKey: "" };
}

function writeVault(v: VaultKeys): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

function clearVault(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * The key vault: bring-your-own-key configuration for the console.
 *
 * Keys live in sessionStorage (this tab only, gone when it closes) and are
 * sent as headers with each run request. The server uses them for that
 * request only — nothing is persisted or logged server-side.
 */
export function KeyVault({
  open,
  onClose,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  onChange: (hasKey: boolean) => void;
}) {
  const [form, setForm] = useState<VaultKeys>({
    provider: "",
    apiKey: "",
    tavilyKey: "",
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

  const save = () => {
    const trimmed: VaultKeys = {
      provider: sanitizeKey(form.provider),
      apiKey: sanitizeKey(form.apiKey),
      tavilyKey: sanitizeKey(form.tavilyKey),
    };
    if (trimmed.apiKey || trimmed.tavilyKey) {
      writeVault(trimmed);
    } else {
      clearVault();
    }
    onChange(Boolean(trimmed.apiKey));
    onClose();
  };

  const clear = () => {
    clearVault();
    setForm({ provider: "", apiKey: "", tavilyKey: "" });
    onChange(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="API key vault"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CutPanel accent="var(--color-spectral)" bodyClassName="p-6">
          <p className="font-display text-lg font-bold italic text-spectral">
            KEY VAULT
          </p>
          <p className="mt-2 text-xs leading-relaxed text-mist">
            Run missions with your own keys. They stay in{" "}
            <span className="text-bone/80">this browser tab</span>{" "}
            (sessionStorage), ride along only with your run requests, and are
            never stored or logged on the server. Close the tab and they&apos;re
            gone.
          </p>

          <label className="font-mono mt-5 block text-[10px] tracking-[0.25em] text-mist">
            PROVIDER
          </label>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    provider: f.provider === p ? "" : p,
                  }))
                }
                className={`font-mono cut-sm border px-2 py-1.5 text-[10px] transition ${
                  form.provider === p
                    ? "border-spectral bg-spectral/15 text-spectral"
                    : "border-edge text-mist hover:border-spectral/50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="font-mono mt-1 text-[9px] text-mist/70">
            none selected = server&apos;s LLM_PROVIDER
          </p>

          <label
            htmlFor="vault-key"
            className="font-mono mt-4 block text-[10px] tracking-[0.25em] text-mist"
          >
            API KEY
          </label>
          <input
            id="vault-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="sk-ant-…  /  sk-…  /  AIza…  /  gsk_…"
            className="cut-sm mt-1.5 w-full border border-edge bg-void px-3 py-2.5 font-mono text-xs text-bone placeholder:text-mist/50 focus:border-spectral focus:outline-none"
          />

          <label
            htmlFor="vault-tavily"
            className="font-mono mt-4 block text-[10px] tracking-[0.25em] text-mist"
          >
            TAVILY KEY <span className="text-mist/60">(optional — arms web_search)</span>
          </label>
          <input
            id="vault-tavily"
            type="password"
            autoComplete="off"
            value={form.tavilyKey}
            onChange={(e) =>
              setForm((f) => ({ ...f, tavilyKey: e.target.value }))
            }
            placeholder="tvly-…"
            className="cut-sm mt-1.5 w-full border border-edge bg-void px-3 py-2.5 font-mono text-xs text-bone placeholder:text-mist/50 focus:border-spectral focus:outline-none"
          />

          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              onClick={clear}
              className="font-mono cut-sm border border-crimson/50 px-4 py-2 text-[10px] tracking-widest text-crimson transition hover:bg-crimson/10"
            >
              CLEAR
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="font-mono cut-sm border border-edge px-4 py-2 text-[10px] tracking-widest text-mist transition hover:text-bone"
              >
                CANCEL
              </button>
              <button
                onClick={save}
                className="font-display cut-sm border border-spectral bg-spectral/10 px-5 py-2 text-xs font-semibold tracking-widest text-spectral transition hover:bg-spectral/25"
              >
                SAVE
              </button>
            </div>
          </div>
        </CutPanel>
      </div>
    </div>
  );
}
