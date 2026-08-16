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
import {
  TableScroller,
  cellClass,
  headerClass,
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

interface GridColumnMeta {
  align?: "left" | "right";
  width?: number;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as GridColumnMeta,
});

interface GridSort {
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
 * Numbers compare numerically, text with Swedish collation. Values that are
 * absent never reach this — `sortUndefined: "last"` settles them first, in
 * both directions, so a school with no reported meritvärde is not the worst
 * one.
 */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "sv");
}

export function DataGrid<T extends RowData>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  rowHeight = 34,
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
        meta: { align: col.align, width: col.width },
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
      <table className="w-full table-fixed border-collapse">
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
                      <span aria-hidden className="text-[9px] text-ink-faint">
                        {sorted === "desc" ? "▾" : sorted ? "▴" : "⇅"}
                      </span>
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              );
            })}
            {/* Trailing spacer so the last column isn't flush against the
              scroll edge. */}
            <th aria-hidden className="w-6 border-b border-line" />
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
              className={`border-b border-line-row ${
                rowHref ? "hover:bg-row-hover focus-within:bg-row-hover" : ""
              }`}
            >
              {row.getAllCells().map((cell, i) => {
                const col = columns[i];
                return (
                  <td key={cell.id} className={cellClass(col)}>
                    {rowHref ? (
                      // Every cell links to the row target so the whole row is
                      // clickable, but only the first one is a tab stop — the
                      // rest are hidden from assistive tech to avoid repeated
                      // links.
                      <Link
                        href={rowHref(row.original)}
                        tabIndex={i === 0 ? undefined : -1}
                        aria-hidden={i === 0 ? undefined : true}
                        aria-label={i === 0 ? rowLabel?.(row.original) : undefined}
                        style={{ height: rowHeight }}
                        className={`flex items-center outline-offset-[-2px] ${
                          col.align === "right" ? "justify-end" : ""
                        }`}
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
                      <table.FlexRender cell={cell} />
                    )}
                  </td>
                );
              })}
              <td aria-hidden />
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroller>
  );
}
