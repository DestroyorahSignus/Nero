"use client";

import { useState } from "react";
import type { ApprovalData } from "@/ai/types";
import { CutPanel } from "@/components/ui/CutPanel";

/**
 * The HITL gate rendered: a pending tool call frozen mid-run, waiting for
 * the operator. ALLOW/DENY post to /api/approve; the streaming run polls
 * for the verdict and resumes. Timeouts auto-deny after 90s.
 */
export function ApprovalCard({
  id,
  data,
}: {
  id: string;
  data: ApprovalData;
}) {
  const [sending, setSending] = useState<null | boolean>(null);

  const decide = async (approved: boolean) => {
    setSending(approved);
    try {
      await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved }),
      });
    } catch {
      setSending(null);
    }
  };

  if (data.status !== "pending") {
    return (
      <p
        className={`font-mono px-4 py-2 text-[10px] tracking-wider ${
          data.status === "approved" ? "text-spectral" : "text-crimson"
        }`}
      >
        {data.toolName} — {data.status.toUpperCase()}
        {data.reason ? ` · ${data.reason}` : ""}
      </p>
    );
  }

  const preview =
    typeof data.input === "object" && data.input !== null
      ? JSON.stringify(data.input, null, 2)
      : String(data.input);

  return (
    <CutPanel accent="var(--color-ember)" bodyClassName="p-4">
      <p className="font-display text-sm font-bold italic text-ember">
        OPERATOR APPROVAL REQUIRED
      </p>
      <p className="font-mono mt-1 text-[10px] tracking-wider text-mist">
        NERO wants to run <span className="text-bone">{data.toolName}</span> —
        the run is paused (auto-denies in 90s)
      </p>
      <pre className="panel-scroll font-mono mt-3 max-h-40 overflow-auto bg-void p-3 text-[10px] leading-relaxed text-bone/80">
        {preview.length > 1200 ? preview.slice(0, 1200) + "…" : preview}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => decide(true)}
          disabled={sending !== null}
          className="font-display cut-sm border border-spectral bg-spectral/10 px-5 py-2 text-xs font-semibold tracking-widest text-spectral transition hover:bg-spectral/25 disabled:opacity-50"
        >
          {sending === true ? "SENDING…" : "ALLOW"}
        </button>
        <button
          onClick={() => decide(false)}
          disabled={sending !== null}
          className="font-display cut-sm border border-crimson bg-crimson/10 px-5 py-2 text-xs font-semibold tracking-widest text-crimson transition hover:bg-crimson/25 disabled:opacity-50"
        >
          {sending === false ? "SENDING…" : "DENY"}
        </button>
      </div>
    </CutPanel>
  );
}
