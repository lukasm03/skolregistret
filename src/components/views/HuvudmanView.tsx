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
import { DASH, dec, num, plural } from "@/lib/format";
import {
  huvudmanSortValue,
  selectHuvudman,
  type HuvudmanAggregate,
} from "@/lib/huvudman-select";
import { parseHuvudmanQuery, searchString, type RawParams } from "@/lib/query";
import { useQueryParams } from "@/hooks/use-query-params";
import { useUrlListPane } from "@/hooks/use-url-list-pane";

const PATH = "/huvudman";

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

  /*
   * What the bars in the "Andel elever" column are drawn against.
   *
   * Not 100. Market share here is long-tailed — a handful of kommuner carry
   * percent, and most huvudmän carry hundredths of one — so a bar scaled to
   * the whole is a bar that is empty for almost every row. Scaled to the
   * largest share in the current selection it answers the question the
   * column is actually there for: how this one compares to the rest of what
   * you are looking at. It moves when the filter moves, which is the point,
   * and the footer note says so.
   */
  const maxAndel = useMemo(
    () => Math.max(0, ...list.rows.map((r) => r.andel ?? 0)),
    [list.rows],
  );

  const kommun = query.kommun ? (kommunName(query.kommun) ?? query.kommun) : undefined;

  const filters = useMemo(
    () => activeHuvudmanFilters(query, { kommun, skolform: form?.label }),
    [query, kommun, form],
  );
  const clearAll = () => patch(clearAllPatch(filters));

  const columns = useMemo<Column<HuvudmanAggregate>[]>(
    () => [
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
      {
        key: "andel",
        header: "Andel elever",
        width: 132,
        align: "right",
        mono: true,
        cell: (r) =>
          r.andel == null ? (
            DASH
          ) : (
            <span className="flex items-center justify-end gap-2">
              {/*
                Decoration, and only that — the figure it stands on is right
                beside it. It drops below `sm`, where the column is narrow
                enough that the bar would be taking room from the number.
              */}
              <span
                aria-hidden
                className="relative hidden h-[4px] w-[34px] flex-none overflow-hidden rounded-full bg-line-row sm:block"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent"
                  style={{
                    width: `${maxAndel > 0 ? (r.andel / maxAndel) * 100 : 0}%`,
                  }}
                />
              </span>
              <span>{dec(r.andel)}%</span>
            </span>
          ),
        sortValue: (r) => huvudmanSortValue(r, "andel"),
        descFirst: true,
      },
      /*
       * No median-of-measure column here, though the skolenhet page has its
       * measures: a median needs each unit's nyckeltal, and shipping those
       * for every unit would roughly double a payload that was only just
       * cut in half. The huvudman detail page carries the figures instead.
       */
    ],
    // Rebuilt when the largest share moves, since the bars are drawn against
    // it — once per settled filter change, the same beat as `list` itself.
    [maxAndel],
  );

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
            columns={columns}
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
            footerNote={
              <span className="text-sm text-ink-subtle">
                Andel av {kommun ? "kommunens" : "rikets"} {num(list.kommunElever)} elever
                i urvalet · staplarna mot den största i urvalet
              </span>
            }
          />
        </div>
      </div>
    </AppShell>
  );
}
