"use client";

import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { compareValues } from "@/lib/sort-rows";
import { SortArrow } from "./icons";
import { TableScroller } from "./TableScroller";
import {
  cellClass,
  headerClass,
  headerSpacerClass,
  rowClass,
  rowLinkClass,
  RowOverlay,
  tableMinWidth,
  type Column,
} from "./DataTable";

/**
 * The list tables. Same look as `DataTable`, but the rows are held by
 * TanStack Table so sorting and paging happen in the browser: changing a
 * filter re-renders this component and nothing else on the page.
 *
 * `DataTable` stays for the detail pages, which render server-side and have
 * nothing to sort or page.
 */

/** Row and header heights, exported so a page can reserve its own space. */
export const ROW_HEIGHT = 34;
export const HEADER_HEIGHT = 30;

interface GridColumnMeta {
  align?: "left" | "right";
  width?: number;
  hint?: string;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as GridColumnMeta,
});

/** Sort state as the grid holds it: one column key plus direction. */
export interface GridSort {
  /** Column key, matching `Column.key`. */
  id: string;
  desc: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  /** Filtered rows in their tiebreak order — the grid sorts and pages them. */
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the entire row becomes a link to this href. */
  rowHref?: (row: T) => string;
  /** Accessible label for the row link (defaults to the first cell's text). */
  rowLabel?: (row: T) => string;
  /** Renders the leading checkbox column from the design. */
  rowHeight?: number;
  emptyMessage?: ReactNode;
  /** Names the scroll region for assistive tech. */
  label?: string;
  sort: GridSort;
  onSortChange: (sort: GridSort) => void;
  pageIndex: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
}

/**
 * Numbers compare numerically, text with Swedish collation — the same rule
 * as everywhere else in the app (`lib/sort-rows.ts`). Values that are absent
 * never reach this — `sortUndefined: "last"` settles them first, in both
 * directions, so a school with no reported meritvärde is not the worst one.
 */

export function DataGrid<T extends RowData>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  rowHeight = ROW_HEIGHT,
  emptyMessage = "Inga träffar.",
  label = "Tabell",
  sort,
  onSortChange,
  pageIndex,
  pageSize,
  onPageChange,
}: Props<T>) {
  const columnDefs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.header,
        accessorFn: (row: T) => col.sortValue?.(row),
        cell: ({ row }) => col.cell(row.original),
        enableSorting: col.sortValue != null,
        sortDescFirst: col.descFirst ?? false,
        sortUndefined: "last" as const,
        sortFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
        meta: { align: col.align, width: col.width, hint: col.hint },
      })),
    [columns],
  );

  const sorting = useMemo<SortingState>(() => [sort], [sort]);
  const pagination = useMemo(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows,
    getRowId: (row) => rowKey(row),
    state: { sorting, pagination },
    // A column can only be sorted one way at a time here, and clicking the
    // active column flips it rather than clearing it — the list is never
    // unordered.
    enableSortingRemoval: false,
    enableMultiSort: false,
    // The view resets the page itself whenever a filter changes; letting the
    // table do it too would fight the URL.
    autoResetPageIndex: false,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next[0]) onSortChange(next[0]);
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      onPageChange(next.pageIndex);
    },
  });

  const bodyRows = table.getRowModel().rows;
  const span = columns.length;

  return (
    <TableScroller minWidth={tableMinWidth(columns)} label={label}>
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr className="bg-surface-head">
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const meta = header.column.columnDef.meta;
              const right = meta?.align === "right";
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  scope="col"
                  title={meta?.hint}
                  aria-sort={
                    sorted ? (sorted === "desc" ? "descending" : "ascending") : undefined
                  }
                  style={meta?.width ? { width: meta.width } : undefined}
                  className={`${headerClass} ${right ? "text-right" : "text-left"}`}
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={`flex w-full items-center gap-1 uppercase hover:text-ink ${
                        right ? "justify-end" : ""
                      } ${sorted ? "text-ink" : ""}`}
                    >
                      <table.FlexRender header={header} />
                      <SortArrow
                        size={11}
                        dir={sorted === "desc" ? "desc" : sorted ? "asc" : null}
                        className={sorted ? "text-ink" : "text-ink-faint"}
                      />
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              );
            })}
            {/* Trailing spacer so the last column isn't flush against the
              scroll edge. */}
            <th aria-hidden className={headerSpacerClass} />
          </tr>
        </thead>
        <tbody>
          {bodyRows.length === 0 && (
            <tr>
              <td colSpan={span + 1} className="h-[64px] px-2 text-base text-ink-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {bodyRows.map((row) => (
            <tr
              key={row.id}
              style={{ height: rowHeight }}
              className={rowClass(rowHref != null)}
            >
              {row.getAllCells().map((cell, i) => {
                const col = columns[i];
                // One real link per row, in the first cell; every other cell
                // keeps its content and gets an empty anchor over it — see
                // `rowLinkClass` and `RowOverlay`. The content staying outside
                // the anchor is what keeps the figures readable.
                const linked = rowHref != null && i === 0;
                return (
                  <td key={cell.id} className={cellClass(col, linked)}>
                    {linked ? (
                      <Link
                        href={rowHref(row.original)}
                        aria-label={rowLabel?.(row.original)}
                        style={{ height: rowHeight }}
                        className={rowLinkClass}
                      >
                        {col.truncate ? (
                          <span className="min-w-0 truncate">
                            <table.FlexRender cell={cell} />
                          </span>
                        ) : (
                          <table.FlexRender cell={cell} />
                        )}
                      </Link>
                    ) : (
                      <>
                        <table.FlexRender cell={cell} />
                        {rowHref != null && <RowOverlay href={rowHref(row.original)} />}
                      </>
                    )}
                  </td>
                );
              })}
              <td aria-hidden>
                {rowHref != null && <RowOverlay href={rowHref(row.original)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroller>
  );
}
