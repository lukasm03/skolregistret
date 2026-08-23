"use client";

import { useMemo } from "react";
import { KoncernFilters } from "@/components/filters/KoncernFilters";
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
import { activeKoncernFilters, clearAllPatch } from "@/lib/active-filters";
import {
  koncernSortValue,
  selectKoncern,
  type KoncernAggregate,
} from "@/lib/koncern-select";
import { DASH, num, plural } from "@/lib/format";
import { parseKoncernQuery, type RawParams } from "@/lib/query";
import type { KoncernGroup } from "@/lib/skolregister";
import { useQueryParams } from "@/hooks/use-query-params";
import { useUrlListPane } from "@/hooks/use-url-list-pane";

const PATH = "/koncern";

/**
 * The koncern list. Like the huvudman list, the aggregation runs in the
 * browser off one copy of `buildKoncernGroups()` — see `HuvudmanView` for
 * why filtering client-side keeps this cheap enough to redo on every
 * keystroke.
 */
export function KoncernView({
  groups,
  initialParams,
}: {
  groups: KoncernGroup[];
  initialParams: RawParams;
}) {
  const [params, patch] = useQueryParams(initialParams);
  const query = useMemo(() => parseKoncernQuery(params), [params]);
  const pane = useUrlListPane(query, params, patch, PATH);
  const form = query.skolform ? skolform(query.skolform) : undefined;

  const selection = useMemo(() => selectKoncern(groups, query), [groups, query]);
  const { rows, formCounts } = selection;

  const total = rows.length;

  const filters = useMemo(
    () => activeKoncernFilters(query, { skolform: form?.label }),
    [query, form],
  );
  const clearAll = () => patch(clearAllPatch(filters));

  const columns = useMemo<Column<KoncernAggregate>[]>(
    () => [
      {
        key: "namn",
        header: "Koncern",
        strong: true,
        truncate: true,
        cell: (r) => r.group.namn,
        sortValue: (r) => koncernSortValue(r, "namn"),
      },
      {
        key: "orgnr",
        header: "Org.nr",
        width: 116,
        mono: true,
        muted: true,
        cell: (r) => r.group.orgNr,
      },
      {
        key: "huvudman",
        header: "Huvudmän",
        width: 92,
        align: "right",
        mono: true,
        cell: (r) => num(r.group.dotterbolag.length),
        sortValue: (r) => koncernSortValue(r, "huvudman"),
        descFirst: true,
      },
      {
        key: "enheter",
        header: "Enheter",
        width: 84,
        align: "right",
        mono: true,
        cell: (r) => num(r.enheter),
        sortValue: (r) => koncernSortValue(r, "enheter"),
        descFirst: true,
      },
      {
        key: "kommuner",
        header: "Kommuner",
        width: 96,
        align: "right",
        mono: true,
        cell: (r) => num(r.kommuner.length),
        sortValue: (r) => koncernSortValue(r, "kommuner"),
        descFirst: true,
      },
      {
        key: "elever",
        header: "Elever",
        width: 88,
        align: "right",
        mono: true,
        cell: (r) => (r.elever ? num(r.elever) : DASH),
        sortValue: (r) => koncernSortValue(r, "elever"),
        descFirst: true,
      },
    ],
    [],
  );

  return (
    <AppShell
      section="/koncern"
      searchAction={PATH}
      searchPlaceholder={site.search.koncern}
      searchValue={query.q}
      onSearchChange={(q) => patch({ q: q || null }, true)}
    >
      {/* See `SchoolsView` — the list pages carry their heading for the
          outline rather than for the eye. */}
      <h1 className="sr-only">Skolkoncerner i {site.riket.toLowerCase()}</h1>
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <KoncernFilters
          query={query}
          formCounts={formCounts}
          activeCount={filters.length}
          onChange={patch}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ListToolbar
            count={plural(total, "koncern", "koncerner")}
            scope={filters.length ? undefined : `${site.riket} · fristående huvudmän`}
          >
            <FilterSummary
              filters={filters}
              onClear={(p) => patch(p)}
              onClearAll={clearAll}
            />
          </ListToolbar>

          <ListPane
            rows={rows}
            columns={columns}
            rowKey={(r) => r.group.slug}
            rowHref={(r) => `/koncern/${r.group.slug}`}
            rowLabel={(r) => `Visa ${r.group.namn}`}
            emptyMessage={
              <NoMatches
                message="Inga koncerner matchar filtret."
                filters={filters}
                onClearAll={clearAll}
              />
            }
            label="Koncerner"
            {...pane}
          />
        </div>
      </div>
    </AppShell>
  );
}
