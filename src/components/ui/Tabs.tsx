"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface TabDef {
  id: string;
  label: string;
  /** How many rows the panel holds — shown beside the label. */
  count?: number;
  content: ReactNode;
}

/**
 * The detail page's tab strip: which data you are looking at, and nothing
 * else.
 *
 * It used to carry a second control beside the strip, for whether a panel
 * explained itself in cards or handed the figures over as a grid. Both
 * panels that offered the choice now show the grid, so the switch, the views
 * it switched between and the `?vy=` it wrote are gone.
 *
 * The roles match the behaviour: one tab stop for the strip, arrows to move
 * within it, Tab to leave it for the panel. Selection follows focus, which is
 * the recommended behaviour when switching panels is cheap — and here it is a
 * re-render of rows that are already in the payload.
 *
 * The choice is written to the query string as `?flik=`. Which tab of a
 * skolenhet you are reading is as much a part of where you are as which
 * skolenhet it is, and holding it in component state alone meant a shared
 * link always opened on the first tab and the back button walked straight off
 * the page. The detail routes are prerendered, so the URL cannot be read
 * while rendering without a hydration mismatch — it is read on mount and on
 * every `popstate` instead, exactly as `useQueryParams` does for the list
 * pages. Whatever else is in the query string (the filter a reader arrived
 * with) is left alone.
 */
const TAB_PARAM = "flik";

export function Tabs({ tabs, defaultTab }: { tabs: TabDef[]; defaultTab?: string }) {
  const fallbackTab = defaultTab ?? tabs[0]?.id;
  const [active, setActive] = useState(fallbackTab);
  const base = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /*
   * The strip pins itself, so everything inside the panel that also pins — a
   * table's column headers — has to start below it rather than under it.
   * `--stuck-top` is the running total of what is already spoken for at the
   * top of the viewport, and this is the one place that adds to it.
   *
   * Measured rather than assumed: the strip is one row of tabs on a wide
   * screen and two once they wrap, and a school with five tabs reaches that
   * point at a different width than one with two.
   */
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      // An unknown value needs no guarding here: `current` below already
      // falls back to the first tab.
      setActive(params.get(TAB_PARAM) ?? fallbackTab);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [fallbackTab]);

  const write = useCallback((key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    // The hash is part of where the reader is — a deep link to a section of
    // the panel survives switching tabs.
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      setActive(id);
      // Re-clicking the tab you are already on is not a navigation — pushing
      // an identical entry would make the back button undo nothing, once per
      // idle click.
      if (id !== active) write(TAB_PARAM, id);
    },
    [write, active],
  );

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === current?.id);
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    selectTab(tab.id);
    // The newly selected tab is the only one in the tab order, so focus has
    // to follow it or the next Tab press would leave the strip entirely.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(tab.id))}`)
      ?.focus();
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/*
        Pinned under the app header. Which tab you are on is the one control
        a long panel keeps needing — a gymnasium's programtabell runs well
        past a screen, and switching to Enkät used to mean scrolling back up
        to find out how.
      */}
      <div
        ref={barRef}
        className="sticky top-[var(--stuck-top)] z-30 flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-line-soft bg-surface"
      >
        <div ref={stripRef} role="tablist" onKeyDown={onKeyDown} className="flex">
          {tabs.map((tab) => {
            const selected = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(tab.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={`-mb-px flex items-center gap-[7px] border-b-2 px-3 py-2 text-base font-medium transition-colors ${
                  selected
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.count != null && (
                  <span className="rounded-xs bg-line-row px-1.5 py-px font-mono text-micro font-normal text-ink-faint">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {current && (
        <div
          id={panelId(current.id)}
          role="tabpanel"
          aria-labelledby={tabId(current.id)}
          // Not focusable itself: the content inside is its own scroll region
          // and already a tab stop, and two in a row is one too many.
          style={
            {
              "--stuck-top": `calc(var(--app-top) + ${barHeight}px)`,
            } as CSSProperties
          }
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
