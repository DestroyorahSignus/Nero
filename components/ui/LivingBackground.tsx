"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-reactive ambience behind the whole app — built to stay cheap.
 *
 * The pointer glow is a fixed-size element moved with `transform: translate3d`
 * only: transforms are GPU-composited, so following the cursor costs no layout
 * and no repaint (the earlier version animated a radial-gradient's *position*
 * and a mask, which repainted full-viewport layers every frame — that was the
 * lag). Everything else (aurora, grid, scanlines) is painted once and either
 * static or animated purely by transform.
 */
export function LivingBackground() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;
    // Skip the follow effect on touch devices — there's no pointer to track.
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight * 0.25;
    let raf = 0;
    let queued = false;

    const paint = () => {
      queued = false;
      glow.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!queued) {
        queued = true;
        raf = requestAnimationFrame(paint);
      }
    };

    paint();
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="living-bg" aria-hidden="true">
      <div className="living-bg-aurora" />
      <div className="living-bg-grid" />
      <div ref={glowRef} className="living-bg-glow" />
    </div>
  );
}
