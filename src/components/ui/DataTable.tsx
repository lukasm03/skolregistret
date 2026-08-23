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

/**
 * `linked` is the one cell of a clickable row that holds the row's link — see
 * `rowLinkClass`. It leaves out `truncate`, because that is `overflow: hidden`
 * and would clip the link's stretched hit area back to this one column; the
 * span inside the link truncates instead.
 */
export function cellClass<T>(col: Column<T>, linked = false): string {
  return [
    "px-2 align-middle",
    col.align === "right" ? "text-right" : "text-left",
    col.mono ? "font-mono text-sm" : col.muted ? "text-sm" : "text-base",
    col.muted ? "text-ink-muted" : "",
    col.strong ? "font-medium" : "",
    col.truncate && !linked ? "truncate" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A clickable row: one real link, in the first cell, stretched over the whole
 * row by a pseudo-element against the `relative` on the `<tr>`.
 *
 * Every cell used to hold its own copy of the link, with all but the first
 * `aria-hidden` to stop a screen reader reading six links per row. That did
 * stop the repetition, and it also took the cells' contents with it: the
 * `<td>`s stayed, but everything inside them was hidden, so a row announced
 * its name and then five empty cells. Kommun, huvudman, status, skolform,
 * elevantal — the figures this whole site exists to publish — reached nobody
 * using assistive technology.
 *
 * One link keeps the single tab stop and the row-wide hit area, and the other
 * cells go back to being plain readable table cells.
 */
export const rowLinkClass =
  "flex items-center outline-offset-[-2px] after:absolute after:inset-0";

/** The `<tr>` classes a clickable row needs, including the link's anchor. */
export function rowClass(clickable: boolean): string {
  return `border-b border-line-row ${
    clickable ? "relative hover:bg-row-hover focus-within:bg-row-hover" : ""
  }`;
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
              className={rowClass(rowHref != null)}
            >
              {columns.map((col, i) => {
                const linked = rowHref != null && i === 0;
                return (
                  <td key={col.key} className={cellClass(col, linked)}>
                    {linked ? (
                      <Link
                        href={rowHref(row)}
                        aria-label={rowLabel?.(row)}
                        style={{ height: rowHeight }}
                        className={rowLinkClass}
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
