"use client";

import { Home } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { StaticMap } from "@/lib/static-map";

type StaticMapViewProps = {
  map: StaticMap;
  className?: string;
  pinIcon?: ReactNode;
  // Tone the tiles down so they read as a "location chip", not a debug screen.
  tone?: boolean;
};

// Renders a 2×2 OSM tile grid sized to cover its container, translated so the
// lat/lon point lands at the container's visual center, with an SVG pin overlay
// positioned at the exact sub-pixel offset.
//
// The grid is sized to 2× the longest container axis. Combined with the
// guarantee from buildStaticMap that the pin's grid-fraction lands in
// [0.25, 0.75], this means the grid always fully covers the visible area.
export function StaticMapView({ map, className, pinIcon, tone = true }: StaticMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid is square. To guarantee coverage in any direction with the pin in
  // [0.25, 0.75], we need each side of the pin to extend at least half the
  // container's longest axis. Pin sits at minimum 0.25 × gridSize from any
  // grid edge, so gridSize ≥ 2 × max(containerW, containerH).
  const gridSize = size ? 2 * Math.max(size.w, size.h) : 0;

  // Translate grid so the pin lands at the container's visual center.
  const offsetX = size ? size.w / 2 - map.pinPctX * gridSize : 0;
  const offsetY = size ? size.h / 2 - map.pinPctY * gridSize : 0;

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden bg-muted/40", className)}>
      {size && (
        <>
          <div
            className={cn(
              "absolute",
              tone && "saturate-[0.55] brightness-[0.97] contrast-[0.95]",
            )}
            style={{
              width: gridSize,
              height: gridSize,
              left: offsetX,
              top: offsetY,
            }}
          >
            {map.tiles.map((tile) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={tile.url}
                src={tile.url}
                alt=""
                loading="lazy"
                className="absolute block select-none"
                style={{
                  left: `${tile.xFrac * 100}%`,
                  top: `${tile.yFrac * 100}%`,
                  width: "50%",
                  height: "50%",
                }}
                draggable={false}
              />
            ))}
          </div>

          {/* Soft vignette to anchor the eye on the pin */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card/40" />

          {/* Pin overlay positioned at exact lat/lon */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: size.w / 2,
              top: size.h / 2,
              transform: "translate(-50%, -50%)",
            }}
          >
            {pinIcon ?? <DefaultPin />}
          </div>
        </>
      )}
    </div>
  );
}

function DefaultPin() {
  return (
    <div className="relative">
      <div className="absolute inset-0 -m-1.5 rounded-full bg-primary/30 blur-md" />
      <div className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md">
        <Home className="h-3 w-3" strokeWidth={2.5} />
      </div>
    </div>
  );
}
