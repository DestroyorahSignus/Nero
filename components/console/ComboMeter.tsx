"use client";

import { useEffect, useRef, useState } from "react";

const TIERS = [
  { at: 0, label: "D", word: "DORMANT" },
  { at: 18, label: "C", word: "CRUISING" },
  { at: 34, label: "B", word: "BLAZING" },
  { at: 50, label: "A", word: "APOCALYPTIC" },
  { at: 66, label: "S", word: "SAVAGE" },
  { at: 80, label: "SS", word: "SICK SKILLS" },
  { at: 92, label: "SSS", word: "SMOKIN' STYLE" },
] as const;

/**
 * DMC combo meter for the run itself: every streamed event lands a hit that
 * pushes the gauge up; inactivity bleeds it back down. Pure theatre — but
 * theatre that visualizes event throughput honestly.
 */
export function ComboMeter({ eventCount, running }: { eventCount: number; running: boolean }) {
  const [value, setValue] = useState(0);
  const lastCount = useRef(0);

  // Hit: each new event bumps the meter
  useEffect(() => {
    if (eventCount > lastCount.current) {
      const hits = eventCount - lastCount.current;
      lastCount.current = eventCount;
      setValue((v) => Math.min(100, v + hits * 9));
    }
    if (eventCount === 0) {
      lastCount.current = 0;
      setValue(0);
    }
  }, [eventCount]);

  // Bleed: decay over time while running; freeze when idle at end
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setValue((v) => Math.max(0, v - 1.4)), 120);
    return () => clearInterval(id);
  }, [running]);

  const tier = [...TIERS].reverse().find((t) => value >= t.at) ?? TIERS[0];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[9px] tracking-[0.3em] text-mist">COMBO</p>
        <p className="font-display text-xs font-bold italic text-spectral">
          {tier.label} <span className="text-[9px] text-mist">{tier.word}</span>
        </p>
      </div>
      <div className="mt-1.5 h-1.5 w-full bg-edge">
        <div className="combo-fill h-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
