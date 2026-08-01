"use client";

import type { PlanData } from "@/ai/types";

/** VERGIL's plan rendered as a mission checklist. */
export function PlanChecklist({ plan }: { plan: PlanData | null }) {
  if (!plan) {
    return (
      <p className="font-mono p-4 text-xs text-mist">
        No plan yet. VERGIL draws it up the moment a mission starts.
      </p>
    );
  }
  return (
    <div className="p-4">
      <p className="font-mono text-[10px] tracking-[0.2em] text-ember">
        ATTEMPT {plan.attempt} · STRATEGY
      </p>
      <p className="mt-1 text-sm leading-relaxed text-bone/85">{plan.strategy}</p>
      <ol className="mt-4 space-y-3">
        {plan.steps.map((s) => (
          <li key={s.index} className="flex gap-3">
            <span className="font-display mt-0.5 text-xs font-bold text-ember">
              {String(s.index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm text-bone">
                {s.title}
                {s.toolHint && (
                  <span className="font-mono ml-2 text-[10px] text-spectral">
                    {s.toolHint}
                  </span>
                )}
              </p>
              <p className="font-mono mt-0.5 text-[10px] leading-relaxed text-mist">
                ✓ {s.successCriteria}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
