import Link from "next/link";
import type { ReactNode } from "react";

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

export const headerClass =
  "h-[30px] border-b border-line px-2 text-micro font-semibold tracking-[0.07em] text-ink-subtle uppercase";

/** What the one flexible column needs before its content stops being readable. */
const FLEX_COLUMN_MIN = 200;

/**
 * The width below which the table scrolls sideways instead of squeezing.
 * `table-fixed` honours the px widths in the column defs, so without a floor
 * the browser takes the space out of whichever column left its width off —
 * the name — until it is a few characters wide. Derived from the columns
 * themselves so a new column moves the floor with it.
 */
export function tableMinWidth<T>(columns: Column<T>[], selectable = false): number {
  const spacer = 24;
  const checkbox = selectable ? 30 : 0;
  return (
    columns.reduce((sum, col) => sum + (col.width ?? FLEX_COLUMN_MIN), 0) +
    spacer +
    checkbox
  );
}

/**
 * Wraps a table in its sideways scroller. It is a tab stop with a name: a
 * region that scrolls has to be reachable by keyboard, and on the detail
 * tables — which have no row links — there is nothing else inside to focus.
 */
export function TableScroller({
  minWidth,
  label,
  children,
}: {
  minWidth: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="w-full overflow-x-auto outline-offset-[-2px]"
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the entire row becomes a link to this href. */
  rowHref?: (row: T) => string;
  /** Accessible label for the row link (defaults to the first cell's text). */
  rowLabel?: (row: T) => string;
  /** Renders the leading checkbox column from the design. */
  selectable?: boolean;
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
  selectable,
  rowHeight = 34,
  emptyMessage = "Inga träffar.",
  label = "Tabell",
}: Props<T>) {
  return (
    <TableScroller minWidth={tableMinWidth(columns, selectable)} label={label}>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-surface-head">
            {selectable && <th className="h-[30px] w-[30px] border-b border-line px-2" />}
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
            <th aria-hidden className="w-6 border-b border-line" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0) + 1}
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
              {selectable && (
                <td className="px-2 align-middle">
                  <span className="block size-[12px] rounded-xs border border-line-control bg-surface" />
                </td>
              )}
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
