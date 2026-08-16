"use client";

import { useMemo } from "react";
import { SchoolFilters } from "@/components/filters/SchoolFilters";
import { AppShell } from "@/components/layout/AppShell";
import {
  ListFooter,
  ListToolbar,
  Pagination,
  PerPageControl,
} from "@/components/list/ListChrome";
import { schoolColumns } from "@/components/tables/schoolColumns";
import { DataGrid } from "@/components/ui/DataGrid";
import { site } from "@/config/site";
import { skolform } from "@/config/skolformer";
import { normalizeApiSchool } from "@/lib/api-normalize";
import { kommunLong, plural } from "@/lib/format";
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

  const selection = useMemo(
    () => selectSchools(normalized, query, huvudmanName),
    [normalized, query, huvudmanName],
  );

  const total = selection.sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / query.perPage));
  const page = Math.min(query.page, totalPages);
  const from = total ? (page - 1) * query.perPage + 1 : 0;
  const to = Math.min(page * query.perPage, total);

  const kommun = query.kommun ? (kommunName(query.kommun) ?? query.kommun) : undefined;

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
          huvudmanName={huvudmanName}
          onChange={patch}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ListToolbar
            count={plural(total, "skolenhet", "skolenheter")}
            scope={
              query.huvudman
                ? "filtrerat på huvudman"
                : `${kommun ? kommunLong(kommun) : site.riket} · ${(form?.label ?? site.allaSkolformer).toLowerCase()}`
            }
          />

          <div className="min-h-[712px]">
            <DataGrid
              rows={selection.sorted}
              rowKey={(s) => s.kod}
              rowHref={(s) => `/skolor/${s.kod}${searchString(params)}`}
              rowLabel={(s) => `Visa ${s.name}`}
              emptyMessage="Inga skolenheter matchar filtret."
              label="Skolenheter"
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
