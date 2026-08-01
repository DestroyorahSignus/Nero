"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CutPanel } from "@/components/ui/CutPanel";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/**
 * ⌘K / Ctrl+K command palette — a keyboard-first launcher for the console.
 * Substring filter, ↑/↓ to move, Enter to run, Esc to close. Parent owns
 * `open`; the global shortcut listener lives in the run page.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [query, commands]);

  // Reset + focus each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  return (
    <div
      className="deck-backdrop fixed inset-0 z-[60] flex items-start justify-center bg-void/85 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className="palette-pop w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <CutPanel accent="var(--color-spectral)" bodyClassName="p-0">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            className="font-mono w-full border-b border-edge bg-transparent px-4 py-3 text-sm text-bone placeholder:text-mist focus:outline-none"
          />
          <ul className="panel-scroll max-h-[50vh] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="font-mono px-4 py-3 text-[11px] text-mist">
                No matching command.
              </li>
            )}
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition ${
                    i === active ? "bg-spectral/10" : ""
                  }`}
                >
                  <span
                    className={`text-sm ${
                      i === active ? "text-spectral" : "text-bone/90"
                    }`}
                  >
                    {c.label}
                  </span>
                  {c.hint && (
                    <span className="font-mono text-[9px] tracking-widest text-mist">
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="font-mono flex items-center gap-3 border-t border-edge px-4 py-2 text-[9px] tracking-widest text-mist/70">
            <span>↑↓ MOVE</span>
            <span>↵ RUN</span>
            <span>ESC CLOSE</span>
          </div>
        </CutPanel>
      </div>
    </div>
  );
}
