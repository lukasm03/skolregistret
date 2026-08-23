"use client";

import { useMemo } from "react";
import type { GridSort } from "@/components/ui/DataGrid";
import { patchParams, searchString, type ListQuery, type RawParams } from "@/lib/query";
import type { Patch } from "./use-query-params";

/** The half of `ListPane`'s props that a URL-backed list wires. */
export interface UrlListPaneProps {
  sort: GridSort;
  onSortChange: (sort: GridSort) => void;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  pageHref: (page: number) => string;
}

/**
 * Sorting and paging, wired from the query string.
 *
 * All three list views had this block verbatim — seven props, the same seven
 * arrow functions, the same `dir` encoding, the same `|| PATH` fallback for
 * page one's href. It is the part of a list that has nothing to do with which
 * list it is, so it does not belong copied into each of them; what stays in
 * the views is what genuinely differs, which is the parser, the selector, the
 * columns, the filter panel and the row hrefs.
 *
 * `ListPane` keeps taking the props one at a time regardless: the huvudman
 * page's enheter tab drives it from local state, with no URL to read or
 * write, and that is a caller this hook cannot serve.
 *
 * Memoized on the four values it reads, so `DataGrid`'s own `useMemo` over
 * the sort object finally has a stable input — the views were handing it a
 * fresh `{ id, desc }` literal on every render, which defeated it.
 */
export function useUrlListPane(
  query: ListQuery,
  params: RawParams,
  patch: (changes: Patch, replace?: boolean) => void,
  /** The list's own path, used for page one, whose href carries no params. */
  path: string,
): UrlListPaneProps {
  const { sort, desc, page, perPage } = query;
  return useMemo(
    () => ({
      sort: { id: sort, desc },
      onSortChange: (next: GridSort) =>
        patch({ sort: next.id, dir: next.desc ? "desc" : "asc" }),
      page,
      perPage,
      onPageChange: (next: number) => patch({ page: next }),
      // Resetting the page on a size change stays the caller's job everywhere
      // else; here there is only one caller and one right answer.
      onPerPageChange: (next: number) => patch({ perPage: next, page: null }),
      pageHref: (next: number) =>
        searchString(patchParams(params, { page: next })) || path,
    }),
    [sort, desc, page, perPage, params, patch, path],
  );
}
