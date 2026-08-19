"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabView {
  /** Shared across tabs: picking a view on one keeps it on the next. */
  id: string;
  label: string;
  /** What the view is for, on the button's tooltip. */
  hint: string;
  content: ReactNode;
}

export interface TabDef {
  id: string;
  label: string;
  /** How many rows the panel holds — shown beside the label. */
  count?: number;
  /** One view renders bare; two or more offer the switch beside the strip. */
  views: TabView[];
}

/**
 * The detail page's tab strip, with a second control beside it for how deeply
 * the panel explains itself.
 *
 * The two axes are genuinely separate: which data you are looking at, and
 * whether you want it read to you or handed over as a grid. A reader who has
 * chosen "Tabell" has chosen it for the page, not for one tab, so the choice
 * survives moving between them — and a tab with only one way to show itself
 * (a table of documents is a table either way) simply hides the switch rather
 * than offering a control that does nothing.
 *
 * The roles match the behaviour: one tab stop for the strip, arrows to move
 * within it, Tab to leave it for the panel. Selection follows focus, which is
 * the recommended behaviour when switching panels is cheap — and here it is a
 * re-render of rows that are already in the payload.
 */
export function Tabs({
  tabs,
  defaultTab,
  defaultView,
}: {
  tabs: TabDef[];
  defaultTab?: string;
  defaultView?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const [view, setView] = useState(defaultView ?? tabs[0]?.views[0]?.id);
  const base = useId();
  const stripRef = useRef<HTMLDivElement>(null);

  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  // A tab that does not offer the chosen view falls back to its first, rather
  // than rendering nothing.
  const currentView = current?.views.find((v) => v.id === view) ?? current?.views[0];

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
    setActive(tab.id);
    // The newly selected tab is the only one in the tab order, so focus has
    // to follow it or the next Tab press would leave the strip entirely.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(tab.id))}`)
      ?.focus();
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-line-soft">
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
                onClick={() => setActive(tab.id)}
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

        {current && current.views.length > 1 && (
          <div className="flex items-center gap-2 pb-1.5">
            <span
              id={`${base}-vy`}
              className="text-micro font-semibold tracking-[0.08em] text-ink-subtle uppercase"
            >
              Vy
            </span>
            <div
              role="group"
              aria-labelledby={`${base}-vy`}
              className="flex rounded-md border border-line bg-surface-segment p-0.5"
            >
              {current.views.map((v) => {
                const selected = v.id === currentView?.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    title={v.hint}
                    aria-pressed={selected}
                    className={`rounded-xs px-2.5 py-[3px] text-xs font-medium transition-colors ${
                      selected
                        ? "bg-surface text-ink shadow-raised"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {current && currentView && (
        <div
          id={panelId(current.id)}
          role="tabpanel"
          aria-labelledby={tabId(current.id)}
          // Not focusable itself: the content inside is its own scroll region
          // and already a tab stop, and two in a row is one too many.
        >
          {currentView.content}
        </div>
      )}
    </div>
  );
}
