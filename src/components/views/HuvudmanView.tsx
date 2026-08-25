"use client";

import { useDeferredValue, useMemo } from "react";
import { HuvudmanFilters } from "@/components/filters/HuvudmanFilters";
import { AppShell } from "@/components/layout/AppShell";
import {
  FilterSummary,
  ListPane,
  ListToolbar,
  NoMatches,
} from "@/components/list/ListChrome";
import type { Column } from "@/components/ui/DataTable";
import { site } from "@/config/site";
import { skolform } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { activeHuvudmanFilters, clearAllPatch } from "@/lib/active-filters";
import {
  normalizeApiHuvudmanList,
  normalizeApiSchool,
  type ListHuvudmanPayload,
  type ListSchoolPayload,
} from "@/lib/api-normalize";
import { DASH, num, plural } from "@/lib/format";
import {
  huvudmanSortValue,
  selectHuvudman,
  type HuvudmanAggregate,
} from "@/lib/huvudman-select";
import { parseHuvudmanQuery, searchString, type RawParams } from "@/lib/query";
import { useQueryParams } from "@/hooks/use-query-params";
import { useUrlListPane } from "@/hooks/use-url-list-pane";

const PATH = "/huvudman";

/*
 * Module scope, not a `useMemo`: nothing here closes over the render. It was
 * memoized while the "andel" column drew its bars against the largest share
 * in the current selection, which moved with the filter; without that column
 * the array is the same array every time, and a constant says so better than
 * an empty dependency list does.
 */
const COLUMNS: Column<HuvudmanAggregate>[] = [
  {
    key: "name",
    header: "Huvudman",
    strong: true,
    truncate: true,
    cell: (r) => r.huvudman.name,
    sortValue: (r) => huvudmanSortValue(r, "name"),
  },
  {
    key: "typ",
    header: "Typ",
    width: 92,
    muted: true,
    cell: (r) => r.huvudman.typ,
    sortValue: (r) => huvudmanSortValue(r, "typ"),
  },
  {
    key: "koncern",
    header: "Koncern",
    width: 190,
    muted: true,
    truncate: true,
    cell: (r) => r.huvudman.koncern ?? DASH,
    sortValue: (r) => huvudmanSortValue(r, "koncern"),
  },
  {
    key: "enheter",
    header: "Enheter",
    width: 76,
    align: "right",
    mono: true,
    cell: (r) => num(r.enheter),
    sortValue: (r) => huvudmanSortValue(r, "enheter"),
    descFirst: true,
  },
  {
    key: "elever",
    header: "Elever",
    width: 82,
    align: "right",
    mono: true,
    cell: (r) => (r.elever ? num(r.elever) : DASH),
    sortValue: (r) => huvudmanSortValue(r, "elever"),
    descFirst: true,
  },
  /*
   * No median-of-measure column here, though the skolenhet page has its
   * measures: a median needs each unit's nyckeltal, and shipping those
   * for every unit would roughly double a payload that was only just
   * cut in half. The huvudman detail page carries the figures instead.
   */
];

/**
 * The huvudman list. Like the skolenhet list, the aggregation runs in the
 * browser off one copy of the register, so changing a filter re-renders this
 * component alone.
 */
export function HuvudmanView({
  huvudman,
  schools,
  initialParams,
}: {
  /** Register rows already trimmed to what this view reads — see `toListHuvudmanPayload`. */
  huvudman: ListHuvudmanPayload[];
  /** Unit rows already trimmed to what this view reads — see `toListSchoolPayload`. */
  schools: ListSchoolPayload[];
  initialParams: RawParams;
}) {
  const [params, patch] = useQueryParams(initialParams);
  const query = useMemo(() => parseHuvudmanQuery(params), [params]);
  const pane = useUrlListPane(query, params, patch, PATH);
  const form = query.skolform ? skolform(query.skolform) : undefined;

  const normalizedHuvudman = useMemo(
    () => normalizeApiHuvudmanList(huvudman),
    [huvudman],
  );
  const normalizedSchools = useMemo(() => schools.map(normalizeApiSchool), [schools]);

  // Aggregating every huvudman over every unit is the expensive step here —
  // see `SchoolsView` for why it runs against a deferred query.
  const deferredQuery = useDeferredValue(query);
  const stale = deferredQuery !== query;

  const list = useMemo(
    () => selectHuvudman(normalizedHuvudman, normalizedSchools, deferredQuery),
    [normalizedHuvudman, normalizedSchools, deferredQuery],
  );

  const total = list.rows.length;

  const kommun = query.kommun ? (kommunName(query.kommun) ?? query.kommun) : undefined;

  const filters = useMemo(
    () => activeHuvudmanFilters(query, { kommun, skolform: form?.label }),
    [query, kommun, form],
  );
  const clearAll = () => patch(clearAllPatch(filters));

  return (
    <AppShell
      section="/huvudman"
      searchAction={PATH}
      searchPlaceholder={site.search.huvudman}
      searchValue={query.q}
      onSearchChange={(q) => patch({ q: q || null }, true)}
    >
      {/* See `SchoolsView` — the list pages carry their heading for the
          outline rather than for the eye. */}
      <h1 className="sr-only">Huvudmän i {site.riket.toLowerCase()}</h1>
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <HuvudmanFilters
          query={query}
          counts={list.counts}
          formCounts={list.formCounts}
          kommuner={list.kommuner}
          activeCount={filters.length}
          onChange={patch}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ListToolbar count={plural(total, "huvudman", "huvudmän")}>
            <FilterSummary
              filters={filters}
              onClear={(p) => patch(p)}
              onClearAll={clearAll}
            />
          </ListToolbar>

          <ListPane
            rows={list.rows}
            columns={COLUMNS}
            rowKey={(r) => r.huvudman.slug}
            rowHref={(r) =>
              `/huvudman/${r.huvudman.slug}${searchString({
                ...(query.skolform ? { skolform: query.skolform } : {}),
                ...(query.kommun ? { kommun: query.kommun } : {}),
              })}`
            }
            rowLabel={(r) => `Visa ${r.huvudman.name}`}
            emptyMessage={
              <NoMatches
                message="Inga huvudmän matchar filtret."
                filters={filters}
                onClearAll={clearAll}
              />
            }
            label="Huvudmän"
            {...pane}
            stale={stale}
          />
        </div>
      </div>
    </AppShell>
  );
}
