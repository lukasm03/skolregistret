"use client";

import { useDeferredValue, useMemo } from "react";
import { HuvudmanFilters } from "@/components/filters/HuvudmanFilters";
import { AppShell } from "@/components/layout/AppShell";
import {
  FilterSummary,
  ListFooter,
  ListToolbar,
  NoMatches,
  Pagination,
  PerPageControl,
} from "@/components/list/ListChrome";
import { DataGrid, HEADER_HEIGHT, ROW_HEIGHT } from "@/components/ui/DataGrid";
import type { Column } from "@/components/ui/DataTable";
import { site } from "@/config/site";
import { skolform } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { activeHuvudmanFilters, clearAllPatch } from "@/lib/active-filters";
import { normalizeApiHuvudmanList, normalizeApiSchool } from "@/lib/api-normalize";
import { DASH, dec, metricNumber, num, plural } from "@/lib/format";
import {
  huvudmanSortValue,
  selectHuvudman,
  type HuvudmanAggregate,
} from "@/lib/huvudman-select";
import { parseHuvudmanQuery, searchString, type RawParams } from "@/lib/query";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister";
import { useQueryParams } from "@/hooks/use-query-params";

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
  huvudman: HuvudmanRad[];
  schools: SkolorRad[];
  initialParams: RawParams;
}) {
  const [params, patch] = useQueryParams(initialParams);
  const query = useMemo(() => parseHuvudmanQuery(params), [params]);
  const form = query.skolform ? skolform(query.skolform) : undefined;
  const primary = form?.metrics.find((m) => m.key === form.headline[0]);

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
  const totalPages = Math.max(1, Math.ceil(total / query.perPage));
  const page = Math.min(query.page, totalPages);
  const from = total ? (page - 1) * query.perPage + 1 : 0;
  const to = Math.min(page * query.perPage, total);

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
        bar: (r) => r.enheter,
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
        bar: (r) => r.elever,
      },
      {
        key: "andel",
        header: "Andel elever",
        width: 96,
        align: "right",
        mono: true,
        cell: (r) => (r.andel != null ? `${dec(r.andel)}%` : DASH),
        sortValue: (r) => huvudmanSortValue(r, "andel"),
        descFirst: true,
        // A share of the kommun's pupils counts up from zero, so a bar means
        // what it looks like. The metric median below does not — see `bar`.
        bar: (r) => r.andel,
      },
      // Only comparable within one skolform, so the column appears with one.
      ...(primary
        ? [
            {
              key: "metric",
              header: `${primary.short}, median`,
              width: 128,
              align: "right" as const,
              mono: true,
              cell: (r: HuvudmanAggregate) => metricNumber(r.metric, primary.unit),
              sortValue: (r: HuvudmanAggregate) => huvudmanSortValue(r, "metric"),
              descFirst: primary.higherIsBetter !== false,
            },
          ]
        : []),
    ],
    [primary],
  );

  return (
    <AppShell
      section="/huvudman"
      searchAction={PATH}
      searchPlaceholder={site.search.huvudman}
      searchValue={query.q}
      onSearchChange={(q) => patch({ q: q || null }, true)}
    >
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
          <ListToolbar
            count={plural(total, "huvudman", "huvudmän")}
            // Replaced by the tokens as soon as there are any — see
            // `SchoolsView` for why the two are not shown together.
            scope={
              filters.length
                ? undefined
                : `${site.riket} · ${site.allaSkolformer.toLowerCase()}`
            }
          >
            <FilterSummary
              filters={filters}
              onClear={(p) => patch(p)}
              onClearAll={clearAll}
            />
          </ListToolbar>

          {/*
            Reserve the height this page will occupy, so the footer does not
            jump as you page or filter. A full page of rows reserves a full
            page; a filter that leaves three rows reserves three, rather than
            the fixed 712px that used to leave most of a screen blank under
            them.
          */}
          <div
            style={{
              minHeight:
                HEADER_HEIGHT + ROW_HEIGHT * Math.max(1, Math.min(query.perPage, total)),
            }}
            className={`transition-opacity ${stale ? "opacity-60" : ""}`}
          >
            <DataGrid
              rows={list.rows}
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
              columns={columns}
              sort={{ id: query.sort, desc: query.desc }}
              onSortChange={(s) => patch({ sort: s.id, dir: s.desc ? "desc" : "asc" })}
              pageIndex={page - 1}
              pageSize={query.perPage}
              onPageChange={(i) => patch({ page: i + 1 })}
            />
          </div>

          <ListFooter>
            <span className="text-sm text-ink-muted">
              Visar {from}–{to} av {total}
            </span>
            <div className="flex-1" />
            <span className="text-sm text-ink-subtle">
              Andel av {kommun ? "kommunens" : "rikets"} {num(list.kommunElever)} elever i
              urvalet
            </span>
            <Pagination
              page={page}
              totalPages={totalPages}
              onGoTo={(p) => patch({ page: p })}
            />
            <PerPageControl
              perPage={query.perPage}
              onChange={(perPage) => patch({ perPage, page: null })}
            />
          </ListFooter>
        </div>
      </div>
    </AppShell>
  );
}
