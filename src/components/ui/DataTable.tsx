import Link from "next/link";
import type { ReactNode } from "react";
import { TableScroller } from "./TableScroller";

export interface Column<T> {
  key: string;
  header: string;
  /** Fixed width in px. Leave out for the one column that should flex. */
  width?: number;
  align?: "left" | "right";
  mono?: boolean;
  strong?: boolean;
  truncate?: boolean;
  muted?: boolean;
  cell: (row: T) => ReactNode;
  /**
   * The value this column sorts on. Providing it makes the header a sort
   * toggle in `DataGrid`; `undefined` for a row sorts that row last in both
   * directions, because a missing figure is not a low one.
   */
  sortValue?: (row: T) => string | number | undefined;
  /** Sorting starts descending — right for "flest först" measures. */
  descFirst?: boolean;
}

export function cellClass<T>(col: Column<T>): string {
  return [
    "px-2 align-middle",
    col.align === "right" ? "text-right" : "text-left",
    col.mono ? "font-mono text-sm" : col.muted ? "text-sm" : "text-base",
    col.muted ? "text-ink-muted" : "",
    col.strong ? "font-medium" : "",
    col.truncate ? "truncate" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A column header, and the rules that let it pin.
 *
 * Two things here are not what they look like. The bottom rule is an inset
 * shadow rather than a border, because `border-collapse: collapse` hands the
 * borders to the table and a sticky cell then leaves its own behind; and the
 * background sits on the cell rather than on the `<tr>`, because a row's
 * background does not travel with a cell that has pinned itself.
 *
 * `sticky` is off until `TableScroller` says the table fits — inside a
 * horizontal scroller it would pin to a box that never scrolls. `--stuck-top`
 * is how far down the viewport is already spoken for: the app header from
 * `sm` up, plus a tab strip where there is one.
 */
export const headerClass =
  "h-[30px] bg-surface-head px-2 text-micro font-semibold tracking-[0.07em] text-ink-subtle uppercase shadow-[inset_0_-1px_0_var(--line)] group-data-[pinned]/scroll:sticky group-data-[pinned]/scroll:top-[var(--stuck-top)] group-data-[pinned]/scroll:z-20";

/** The trailing spacer cell, which has to pin with the rest of the row. */
export const headerSpacerClass =
  "w-6 bg-surface-head shadow-[inset_0_-1px_0_var(--line)] group-data-[pinned]/scroll:sticky group-data-[pinned]/scroll:top-[var(--stuck-top)] group-data-[pinned]/scroll:z-20";

/** What the one flexible column needs before its content stops being readable. */
const FLEX_COLUMN_MIN = 200;

/**
 * The width below which the table scrolls sideways instead of squeezing.
 * `table-fixed` honours the px widths in the column defs, so without a floor
 * the browser takes the space out of whichever column left its width off —
 * the name — until it is a few characters wide. Derived from the columns
 * themselves so a new column moves the floor with it.
 */
export function tableMinWidth<T>(columns: Column<T>[]): number {
  const spacer = 24;
  return columns.reduce((sum, col) => sum + (col.width ?? FLEX_COLUMN_MIN), 0) + spacer;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the entire row becomes a link to this href. */
  rowHref?: (row: T) => string;
  /** Accessible label for the row link (defaults to the first cell's text). */
  rowLabel?: (row: T) => string;
  rowHeight?: number;
  emptyMessage?: ReactNode;
  /** Names the scroll region for assistive tech. */
  label?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  rowHeight = 34,
  emptyMessage = "Inga träffar.",
  label = "Tabell",
}: Props<T>) {
  return (
    <TableScroller minWidth={tableMinWidth(columns)} label={label}>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-surface-head">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={`${headerClass} ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {col.header}
              </th>
            ))}
            {/* Trailing spacer so the last column isn't flush against the
              scroll edge. */}
            <th aria-hidden className={headerSpacerClass} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="h-[64px] px-2 text-base text-ink-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              style={{ height: rowHeight }}
              className={`border-b border-line-row ${
                rowHref ? "hover:bg-row-hover focus-within:bg-row-hover" : ""
              }`}
            >
              {columns.map((col, i) => (
                <td key={col.key} className={cellClass(col)}>
                  {rowHref ? (
                    // Every cell links to the row target so the whole row is
                    // clickable, but only the first one is a tab stop — the rest
                    // are hidden from assistive tech to avoid repeated links.
                    <Link
                      href={rowHref(row)}
                      tabIndex={i === 0 ? undefined : -1}
                      aria-hidden={i === 0 ? undefined : true}
                      aria-label={i === 0 ? rowLabel?.(row) : undefined}
                      style={{ height: rowHeight }}
                      className={`flex items-center outline-offset-[-2px] ${
                        col.align === "right" ? "justify-end" : ""
                      }`}
                    >
                      {col.truncate ? (
                        <span className="min-w-0 truncate">{col.cell(row)}</span>
                      ) : (
                        col.cell(row)
                      )}
                    </Link>
                  ) : (
                    col.cell(row)
                  )}
                </td>
              ))}
              <td aria-hidden />
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroller>
  );
}
