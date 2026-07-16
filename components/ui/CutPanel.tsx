import type { ReactNode, CSSProperties } from "react";

/**
 * The interface's core geometry: a corner-cut panel. Two clipped layers —
 * the outer acts as a 1px "border" in the accent color, the inner is the
 * panel surface. clip-path eats real borders, hence the trick.
 */
export function CutPanel({
  children,
  accent = "var(--color-edge)",
  className = "",
  bodyClassName = "",
  small = false,
  style,
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
  bodyClassName?: string;
  small?: boolean;
  style?: CSSProperties;
}) {
  const cut = small ? "cut-sm" : "cut";
  return (
    <div
      className={`${cut} ${className}`}
      style={{ background: accent, padding: 1, ...style }}
    >
      <div className={`${cut} h-full w-full bg-panel ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
