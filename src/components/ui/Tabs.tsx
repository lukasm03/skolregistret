"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Plain client-side tab switch — no URL state, no library. The detail page
 * only ever needs one of these per section, so there is no case yet for
 * sharing selection across components via the query string.
 *
 * It declared `tablist` and `tab` without the rest of the pattern: no
 * `tabpanel` for the tabs to point at, and every tab its own tab stop with
 * the arrow keys doing nothing. The roles now match the behaviour — one tab
 * stop for the strip, arrows to move within it, Tab to leave it for the
 * panel. Selection follows focus, which is the recommended behaviour when
 * switching panels is cheap, and here it is a re-render of already-loaded
 * rows.
 */
export function Tabs({ tabs, defaultTab }: { tabs: TabDef[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const base = useId();
  const stripRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col gap-2.5">
      <div
        ref={stripRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex items-center gap-1 border-b border-line-soft"
      >
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
              className={`-mb-px border-b-2 px-3 py-2 text-base font-medium transition-colors ${
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {current && (
        <div
          id={panelId(current.id)}
          role="tabpanel"
          aria-labelledby={tabId(current.id)}
          // Not focusable itself: the table inside is its own scroll region
          // and already a tab stop, and two in a row is one too many.
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
