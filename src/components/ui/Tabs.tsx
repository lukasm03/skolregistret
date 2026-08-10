"use client";

import { useState, type ReactNode } from "react";

interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Plain client-side tab switch — no URL state, no library. The detail page
 * only ever needs one of these per section, so there is no case yet for
 * sharing selection across components via the query string.
 */
export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: TabDef[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-2.5">
      <div role="tablist" className="flex items-center gap-1 border-b border-line-soft">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            onClick={() => setActive(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-base font-medium transition-colors ${
              tab.id === current?.id
                ? "border-accent text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current?.content}
    </div>
  );
}
