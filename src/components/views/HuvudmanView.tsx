"use client";

import { useMemo } from "react";
import { HuvudmanFilters } from "@/components/filters/HuvudmanFilters";
import { AppShell } from "@/components/layout/AppShell";
import {
  ListFooter,
  ListToolbar,
  Pagination,
  PerPageControl,
} from "@/components/list/ListChrome";
import { DataGrid } from "@/components/ui/DataGrid";
import type { Column } from "@/components/ui/DataTable";
import { site } from "@/config/site";
import { skolform } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { normalizeApiHuvudmanList, normalizeApiSchool } from "@/lib/api-normalize";
import { DASH, dec, kommunLong, metricNumber, num, plural } from "@/lib/format";
import {
  huvudmanSortValue,
  selectHuvudman,
  type HuvudmanAggregate,
} from "@/lib/huvudman-select";
import { parseHuvudmanQuery, searchString, type RawParams } from "@/lib/query";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister-api";
import { useQueryParams } from "@/lib/use-query-params";

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
  const normalizedSchools = useMemo(
    () => schools.map(normalizeApiSchool),
    [schools],
  );

  const list = useMemo(
    () => selectHuvudman(normalizedHuvudman, normalizedSchools, query),
    [normalizedHuvudman, normalizedSchools, query],
  );

  const total = list.rows.length;
  const totalPages = Math.max(1, Math.ceil(total / query.perPage));
  const page = Math.min(query.page, totalPages);
  const from = total ? (page - 1) * query.perPage + 1 : 0;
  const to = Math.min(page * query.perPage, total);

  const kommun = query.kommun
    ? (kommunName(query.kommun) ?? query.kommun)
    : undefined;

  // The React Compiler declines to optimize this one because the conditional
  // `primary` column spread reads as a dependency it cannot prove stable. The
  // memo is still correct — the component just misses compiler optimization.
  // Disabled rather than restructured: rewriting it would change working
  // render behaviour for no user-visible gain.
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
        width: 96,
        align: "right",
        mono: true,
        cell: (r) => (r.andel != null ? `${dec(r.andel)}%` : DASH),
        sortValue: (r) => huvudmanSortValue(r, "andel"),
        descFirst: true,
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
              cell: (r: HuvudmanAggregate) =>
                metricNumber(r.metric, primary.unit),
              sortValue: (r: HuvudmanAggregate) => huvudmanSortValue(r, "metric"),
              descFirst: primary.higherIsBetter !== false,
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [primary],
  );

  const where = kommun ? kommunLong(kommun) : site.riket;
  const scope = form
    ? `${where} · ${form.label.toLowerCase()}`
    : `${where} · alla skolformer`;

  return (
    <AppShell
      section="/huvudman"
      crumbs={[{ label: "Huvudmän" }, { label: kommun ?? site.riket }]}
      searchAction={PATH}
      searchPlaceholder={site.search.huvudman}
      searchValue={query.q}
      onSearchChange={(q) => patch({ q: q || null }, true)}
    >
      <div className="flex items-stretch">
        <HuvudmanFilters
          query={query}
          counts={list.counts}
          formCounts={list.formCounts}
          kommuner={list.kommuner}
          onChange={patch}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ListToolbar
            count={plural(total, "huvudman", "huvudmän")}
            scope={scope}
          />

          <div className="min-h-[712px]">
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
              emptyMessage="Inga huvudmän matchar filtret."
              columns={columns}
              sort={{ id: query.sort, desc: query.desc }}
              onSortChange={(s) =>
                patch({ sort: s.id, dir: s.desc ? "desc" : "asc" })
              }
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
              Andel av {kommun ? "kommunens" : "rikets"}{" "}
              {num(list.kommunElever)} elever i urvalet
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
