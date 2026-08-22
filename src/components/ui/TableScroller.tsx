"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps a table in its sideways scroller, and decides which of two things the
 * table gets: a pinned header, or a scrollable one.
 *
 * The two are mutually exclusive and CSS is what makes them so. `overflow-x:
 * auto` forces the computed `overflow-y` up from `visible` to `auto`, which
 * makes this element the scrollport for everything inside it — so a
 * `position: sticky` header inside a horizontally scrolling table pins to a
 * box that never scrolls vertically, i.e. does not pin at all. There is no
 * arrangement of one table that has both.
 *
 * So it measures. When the table fits in the space available, the overflow
 * goes back to `visible`, this stops being a scrollport, and the header pins
 * to the page under whatever is already stuck at the top. When it does not
 * fit, the scroller stays and the edge it can scroll towards is shaded, which
 * is the thing a bare `overflow-x: auto` never said out loud.
 *
 * `minWidth` is the deciding figure and it is known at render — the columns
 * declare it (`tableMinWidth`). Measuring `clientWidth` rather than
 * `scrollWidth` is what keeps this from oscillating: the box's own width does
 * not depend on which overflow mode it is in, so the answer cannot flip the
 * input that produced it.
 *
 * A client component so it can measure, but the table itself is passed in as
 * `children` — the server pages that use `DataTable` hand over already
 * rendered rows, so their column `cell` functions never have to cross the
 * boundary.
 */
export function TableScroller({
  minWidth,
  label,
  children,
}: {
  minWidth: number;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** True once the table is known to fit — the header pins in this state. */
  const [fits, setFits] = useState(false);
  const [edges, setEdges] = useState({ start: false, end: false });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // A couple of px of slack. Landing exactly on the boundary would let the
    // mode flip the page's own scrollbar in and out, and that changes the
    // width this decision was made from.
    setFits(el.clientWidth + 2 >= minWidth);
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      start: el.scrollLeft > 1,
      end: max > 1 && el.scrollLeft < max - 1,
    });
  }, [minWidth]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        // A region that scrolls has to be reachable by keyboard, and on the
        // detail tables — which have no row links — there is nothing else
        // inside to focus. One that does not scroll is a tab stop that goes
        // nowhere, so it gives the stop back.
        tabIndex={fits ? undefined : 0}
        // Read by the header cells, which turn sticky off the same signal —
        // see `headerClass` and its `group-data-[pinned]` variants.
        {...(fits ? { "data-pinned": "" } : null)}
        className={`group/scroll w-full outline-offset-[-2px] ${
          fits ? "overflow-x-visible" : "overflow-x-auto"
        }`}
      >
        <div style={{ minWidth }}>{children}</div>
      </div>

      {/*
        Which way there is more table. Ink rather than a surface colour: the
        shade falls across the header, the rows and whichever row is hovered
        on its way down, and a fade to one of those three is wrong on the
        other two.
      */}
      {edges.start && <Edge side="left" />}
      {edges.end && <Edge side="right" />}
    </div>
  );
}

function Edge({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 w-3 ${
        side === "left" ? "left-0" : "right-0"
      }`}
      style={{
        background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--edge-shadow), transparent)`,
      }}
    />
  );
}
