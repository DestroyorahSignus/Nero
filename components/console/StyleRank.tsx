"use client";

import type { VerdictData } from "@/ai/types";

const LADDER = ["D", "C", "B", "A", "S", "SS", "SSS"] as const;

const RANK_WORDS: Record<string, string> = {
  D: "Dismal",
  C: "Crazy",
  B: "Badass",
  A: "Apocalyptic",
  S: "Savage",
  SS: "Sick Skills",
  SSS: "Smokin' Sexy Style!!",
};

/**
 * The signature element: LADY's verdict rendered as a DMC style rank.
 * Score 0-100 → D…SSS, slammed onto the screen, with the full ladder lit
 * up to the achieved rank.
 */
export function StyleRank({ verdict }: { verdict: VerdictData | null }) {
  const reachedIdx = verdict ? LADDER.indexOf(verdict.rank) : -1;

  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center p-4">
      {verdict ? (
        <>
          <p
            key={`${verdict.attempt}-${verdict.rank}`}
            className="rank-glyph text-7xl"
            data-fail={!verdict.pass}
            aria-label={`Style rank ${verdict.rank}`}
          >
            {verdict.rank}
          </p>
          <p className="font-display mt-1 text-xs italic tracking-wide text-bone/70">
            {RANK_WORDS[verdict.rank]}
          </p>
          <p className="font-mono mt-2 text-[10px] tracking-[0.2em] text-mist">
            SCORE {verdict.score}/100 · ATTEMPT {verdict.attempt} ·{" "}
            <span className={verdict.pass ? "text-spectral" : "text-crimson"}>
              {verdict.pass ? "PASS" : "FAIL"}
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-5xl font-bold italic text-edge">—</p>
          <p className="font-mono mt-2 text-[10px] tracking-[0.3em] text-mist">
            AWAITING VERDICT
          </p>
        </>
      )}

      {/* Rank ladder */}
      <div className="mt-3 flex w-full items-end justify-between gap-1" aria-hidden>
        {LADDER.map((r, i) => {
          const lit = i <= reachedIdx;
          return (
            <div key={r} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full ${lit ? (verdict?.pass ? "bg-spectral" : "bg-crimson") : "bg-edge"}`}
                style={{ height: 4 + i * 3 }}
              />
              <span
                className={`font-display text-[9px] font-bold italic ${
                  lit ? (verdict?.pass ? "text-spectral" : "text-crimson") : "text-mist/40"
                }`}
              >
                {r}
              </span>
            </div>
          );
        })}
      </div>

      {verdict && (
        <div className="mt-3 w-full space-y-1">
          {verdict.criteria.map((c) => (
            <div key={c.name} className="flex items-center gap-2">
              <span className="font-mono w-28 shrink-0 text-[9px] text-mist">
                {c.name.replace("_", " ")}
              </span>
              <div className="h-1 flex-1 bg-edge">
                <div
                  className={`h-full ${c.score >= 70 ? "bg-spectral" : "bg-crimson"}`}
                  style={{ width: `${c.score}%` }}
                />
              </div>
              <span className="font-mono w-6 text-right text-[9px] text-bone/70">
                {c.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
