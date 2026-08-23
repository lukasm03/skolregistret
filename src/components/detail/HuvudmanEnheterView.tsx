"use client";

import { useMemo, useState } from "react";
import { FilterSummary, ListPane, NoMatches } from "@/components/list/ListChrome";
import { schoolColumns } from "@/components/tables/schoolColumns";
import { SelectField } from "@/components/filters/controls";
import { SearchFieldContents, searchBoxClass } from "@/components/ui/SearchField";
import { site } from "@/config/site";
import { skolform, skolformer } from "@/config/skolformer";
import type { ActiveFilter, ClearPatch } from "@/lib/active-filters";
import type { ListSchool } from "@/lib/school-fields";
import { plural } from "@/lib/format";
import type { SkolformCode } from "@/lib/types";

/**
 * The huvudman detail page's "Skolenheter" tab: a self-contained live list,
 * scoped to this huvudman's own units. Local state rather than URL-synced —
 * unlike the top-level list pages, this is nested inside a tab that is
 * itself only local state (`Tabs`), so there is nothing to make shareable.
 */
export function HuvudmanEnheterView({ units }: { units: ListSchool[] }) {
  const [q, setQ] = useState("");
  const [kommun, setKommun] = useState("");
  const [form, setForm] = useState<SkolformCode | "">("");
  const [sort, setSort] = useState({ id: "elever", desc: true });
  const [pageIndex, setPageIndex] = useState(0);
  const [perPage, setPerPage] = useState<number>(site.pagination.perPage);

  const kommunOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of units) {
      if (!u.kommun) continue;
      counts.set(u.kommun, (counts.get(u.kommun) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ value: name, label: name, count }))
      .sort((a, b) => a.label.localeCompare(b.label, "sv"));
  }, [units]);

  const formOptions = useMemo(() => {
    const counts = new Map<SkolformCode, number>();
    for (const u of units)
      for (const f of u.forms) counts.set(f, (counts.get(f) ?? 0) + 1);
    return skolformer
      .filter((f) => counts.has(f.code))
      .map((f) => ({ value: f.code, label: f.label, count: counts.get(f.code) }));
  }, [units]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return units.filter((u) => {
      if (needle && !u.name.toLowerCase().includes(needle)) return false;
      if (kommun && u.kommun !== kommun) return false;
      if (form && !u.forms.includes(form)) return false;
      return true;
    });
  }, [units, q, kommun, form]);

  // `clear` mirrors the query-param convention the top-level lists use
  // (`ClearPatch`, applied via `href`/`patch`), just against local state
  // here instead of the URL.
  const filters: ActiveFilter[] = [
    ...(q.trim()
      ? [{ key: "q", label: "Sök", value: q.trim(), clear: { q: null } }]
      : []),
    ...(kommun
      ? [{ key: "kommun", label: "Kommun", value: kommun, clear: { kommun: null } }]
      : []),
    ...(form
      ? [
          {
            key: "skolform",
            label: "Skolform",
            value: skolform(form)?.label ?? form,
            clear: { skolform: null },
          },
        ]
      : []),
  ];
  const applyClear = (patch: ClearPatch) => {
    if ("q" in patch) setQ("");
    if ("kommun" in patch) setKommun("");
    if ("skolform" in patch) setForm("");
    setPageIndex(0);
  };
  const clearAll = () => applyClear({ q: null, kommun: null, skolform: null });

  // Stable identity: DataGrid rebuilds its TanStack column defs whenever the
  // columns prop changes, so a fresh array per render would redo that work on
  // every keystroke.
  const columns = useMemo(
    () => [
      schoolColumns.name(),
      schoolColumns.status(),
      schoolColumns.kommun(),
      schoolColumns.skolformer(),
      schoolColumns.elever(),
    ],
    [],
  );

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${searchBoxClass} max-w-[280px] min-w-[200px] flex-1`}>
          <SearchFieldContents
            placeholder="Sök skolenhet…"
            value={q}
            onChange={(next) => {
              setQ(next);
              setPageIndex(0);
            }}
          />
        </div>
        <div className="w-[170px]">
          <SelectField
            name="kommun"
            value={kommun}
            onChange={(v) => {
              setKommun(v);
              setPageIndex(0);
            }}
            allLabel={site.allaKommuner}
            label="Filtrera på kommun"
            options={kommunOptions}
          />
        </div>
        <div className="w-[160px]">
          <SelectField
            name="skolform"
            value={form}
            onChange={(v) => {
              setForm(v as SkolformCode | "");
              setPageIndex(0);
            }}
            allLabel={site.allaSkolformer}
            label="Filtrera på skolform"
            options={formOptions}
          />
        </div>
        {/*
          Filtering here happens in the browser with no navigation, same as on
          the list pages — and same as there, the count is the one thing that
          has to be said out loud when the table changes under it.
        */}
        <span aria-live="polite" aria-atomic className="text-base font-medium">
          {plural(filtered.length, "skolenhet", "skolenheter")}
        </span>
        <FilterSummary filters={filters} onClear={applyClear} onClearAll={clearAll} />
      </div>

      <ListPane
        rows={filtered}
        columns={columns}
        rowKey={(s) => s.kod}
        rowHref={(s) => `/skolor/${s.kod}`}
        rowLabel={(s) => `Visa ${s.name}`}
        emptyMessage={
          <NoMatches
            message="Inga skolenheter matchar filtret."
            filters={filters}
            onClearAll={clearAll}
          />
        }
        label="Skolenheter under huvudmannen"
        sort={sort}
        onSortChange={setSort}
        page={pageIndex + 1}
        perPage={perPage}
        onPageChange={(p) => setPageIndex(p - 1)}
        onPerPageChange={(n) => {
          setPerPage(n);
          setPageIndex(0);
        }}
        // `overflow-clip` rather than `hidden`: both round off the grid's
        // corners, but `hidden` makes this a scroll container, and a column
        // header that pins inside one pins to a box that never scrolls.
        frameClassName="overflow-clip rounded-lg border border-line-soft"
      />

      <p className="max-w-[760px] text-sm leading-[1.55] text-ink-faint">
        {site.footnotes.elevantal}
      </p>
    </section>
  );
}
