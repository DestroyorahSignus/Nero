"use client";

import { useEffect, useRef } from "react";

/**
 * The living background — a fixed, cursor-reactive ambience layer behind the
 * whole app. Slow drifting aurora blooms in the Devil-Trigger palette, plus a
 * faint grid and a glow that track the pointer. Purely decorative: fixed,
 * pointer-events:none, and sat behind content at a negative z-index.
 *
 * The pointer position is written to CSS custom properties (--mx/--my) on rAF,
 * so the cursor-following gradients are GPU-composited and never re-render React.
 */
export function LivingBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", ((e.clientX / window.innerWidth) * 100).toFixed(2) + "%");
        el.style.setProperty("--my", ((e.clientY / window.innerHeight) * 100).toFixed(2) + "%");
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="living-bg" aria-hidden="true">
      <div className="living-bg-aurora" />
      <div className="living-bg-grid" />
      <div className="living-bg-cursor" />
      <div className="living-bg-scan" />
    </div>
  );
}
