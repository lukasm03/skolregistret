"use client";

import { useDeferredValue, useMemo } from "react";
import { SchoolFilters } from "@/components/filters/SchoolFilters";
import { AppShell } from "@/components/layout/AppShell";
import {
  FilterSummary,
  ListPane,
  ListToolbar,
  NoMatches,
} from "@/components/list/ListChrome";
import { schoolColumns } from "@/components/tables/schoolColumns";
import { site } from "@/config/site";
import { skolform } from "@/config/skolformer";
import { activeSchoolFilters, clearAllPatch } from "@/lib/active-filters";
import { normalizeApiSchool } from "@/lib/api-normalize";
import { plural } from "@/lib/format";
import { parseSchoolQuery, searchString, type RawParams } from "@/lib/query";
import { selectSchools } from "@/lib/school-select";
import type { SkolorRad } from "@/lib/skolregister";
import { useQueryParams } from "@/hooks/use-query-params";
import { kommunName } from "@/data/kommuner";

const PATH = "/skolor";

/**
 * The skolenhet list. The whole register is in memory here, so a filter
 * change is a re-render of this component and nothing else: the header, the
 * sidebar and the table chrome stay put, and no request is made.
 */
export function SchoolsView({
  schools,
  initialParams,
  huvudmanNames,
}: {
  schools: SkolorRad[];
  initialParams: RawParams;
  huvudmanNames: Record<string, string>;
}) {
  const [params, patch] = useQueryParams(initialParams);
  const query = useMemo(() => parseSchoolQuery(params), [params]);
  const normalized = useMemo(() => schools.map(normalizeApiSchool), [schools]);
  const form = query.skolform ? skolform(query.skolform) : undefined;
  const huvudmanName = query.huvudman ? huvudmanNames[query.huvudman] : undefined;

  /*
   * Selecting runs over the whole register — every keystroke in the search
   * field filters, counts and sorts thousands of rows. Deferring it lets
   * React keep the previous table on screen and stay responsive to the next
   * keystroke instead of blocking on this one; the field itself reads the
   * immediate query, so typing never lags. `stale` is true while the visible
   * table belongs to an older query, and fades it slightly to say so.
   */
  const deferredQuery = useDeferredValue(query);
  const stale = deferredQuery !== query;

  const selection = useMemo(
    () => selectSchools(normalized, deferredQuery, huvudmanName),
    [normalized, deferredQuery, huvudmanName],
  );

  const kommun = query.kommun ? (kommunName(query.kommun) ?? query.kommun) : undefined;

  const filters = useMemo(
    () =>
      activeSchoolFilters(query, {
        kommun,
        huvudman: huvudmanName,
        skolform: form?.label,
      }),
    [query, kommun, huvudmanName, form],
  );
  const clearAll = () => patch(clearAllPatch(filters));

  const total = selection.sorted.length;

  const columns = useMemo(
    () => [
      schoolColumns.name(),
      schoolColumns.huvudman(),
      // With one kommun selected the column would repeat itself.
      ...(kommun ? [] : [schoolColumns.kommun()]),
      schoolColumns.status(),
      schoolColumns.skolformer(),
      // Same headers regardless of skolform — only the figure behind
      // "Elever" narrows to the selected form.
      schoolColumns.elever(form?.code),
    ],
    [form, kommun],
  );

  return (
    <AppShell
      section="/skolor"
      searchAction={PATH}
      searchPlaceholder={site.search.skolor}
      searchValue={query.q}
      onSearchChange={(q) => patch({ q: q || null }, true)}
    >
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <SchoolFilters
          query={query}
          counts={selection.counts}
          formCounts={selection.formCounts}
          statusCounts={selection.statusCounts}
          kommuner={selection.kommuner}
          programmes={selection.gymnasieprogram}
          form={form}
          activeCount={filters.length}
          onChange={patch}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ListToolbar
            count={plural(total, "skolenhet", "skolenheter")}
            // The scope line describes an unfiltered list. Once there are
            // tokens they say the same thing more precisely, and repeating
            // "Hela riket" beside a kommun token would contradict them.
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

          <ListPane
            rows={selection.sorted}
            columns={columns}
            rowKey={(s) => s.kod}
            rowHref={(s) => `/skolor/${s.kod}${searchString(params)}`}
            rowLabel={(s) => `Visa ${s.name}`}
            emptyMessage={
              <NoMatches
                message="Inga skolenheter matchar filtret."
                filters={filters}
                onClearAll={clearAll}
              />
            }
            label="Skolenheter"
            sort={{ id: query.sort, desc: query.desc }}
            onSortChange={(s) => patch({ sort: s.id, dir: s.desc ? "desc" : "asc" })}
            page={query.page}
            perPage={query.perPage}
            onPageChange={(p) => patch({ page: p })}
            onPerPageChange={(perPage) => patch({ perPage, page: null })}
            stale={stale}
          />
        </div>
      </div>
    </AppShell>
  );
}
