import Link from "next/link";
import type { ReactNode } from "react";
import { TableScroller } from "./TableScroller";

export interface Column<T> {
  key: string;
  header: string;
  /**
   * What the column measures, for a header too abbreviated to say it. Lands
   * on the `<th>` as `title`: the tooltip a mouse gets, and — because the
   * header already has its own text as a name — the description assistive
   * tech reads with it.
   */
  hint?: string;
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
 * `linked` is the one cell of a clickable row that holds the row's real link —
 * see `rowLinkClass`. It leaves out `truncate` and lets the span inside the
 * link do it instead, so the link is free to fill the cell it sits in rather
 * than being sized by an ellipsis.
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
 * A clickable row: one real link in the first cell, and an empty overlay
 * anchor in each of the others — see `RowOverlay`. Between them the whole row
 * is a hit area, without a second link reaching the accessibility tree.
 *
 * This was one link stretched over the row by a pseudo-element anchored on
 * `position: relative` on the `<tr>`, which is the usual way to do it and does
 * not work here. WebKit does not implement positioning on a table row at all:
 * `getComputedStyle(tr).position` reads `static` in Safari however the rule is
 * written. So the pseudo-element resolved against the next positioned ancestor
 * instead — `TableScroller`'s wrapper — and every row's hit area became the
 * size of the whole table. Twenty of those, painted in tree order with
 * `z-index: auto`, and the last row of the page collected every click in it.
 *
 * Cells are the level WebKit does position, so `rowClass` puts `relative` on
 * the `<td>`s and each cell carries its own piece of the row.
 *
 * Every cell used to hold a copy of the link with the cell's own contents
 * inside it, all but the first `aria-hidden`. That stopped a reader hearing
 * six links per row and took the figures with it: kommun, huvudman, status,
 * skolform, elevantal — the things this site exists to publish — were inside
 * the hidden element and reached nobody. `RowOverlay` is why that cannot
 * happen again: it has no children to hide.
 */
export const rowLinkClass =
  "flex items-center outline-offset-[-2px] after:absolute after:inset-0";

/**
 * The rest of a clickable row's hit area: one empty anchor per cell, sized to
 * the cell it sits in by the `relative` `rowClass` puts on every `<td>`.
 *
 * Empty is the whole point — the cell's content stays a sibling of this, never
 * a child, so hiding the duplicate link hides nothing anybody needs. It is a
 * `Link` rather than a bare `<a>` so that clicking a figure navigates the same
 * way clicking the name does; Next dedupes the prefetch, since every anchor in
 * the row points at one href. `tabIndex={-1}` keeps focus out of something a
 * reader cannot announce — the row already has its tab stop, in the first cell.
 */
export function RowOverlay({ href }: { href: string }) {
  return <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0" />;
}

/**
 * The `<tr>` classes a clickable row needs, including what its cells anchor on.
 *
 * Everything positional here is addressed at the cells, because a `<tr>` is the
 * one box in this table Safari will not position — see `rowLinkClass`. The
 * tables are `border-separate` for the same reason the `relative` is on the
 * cells: under the collapsed model a cell's borders belong to the table, and
 * that is not a box to hang a hit area off either.
 *
 * `[&>td]` rather than `cellClass` for both rules: the trailing spacer cell
 * does not go through `cellClass`, and it needs the rule under it and an
 * anchor over it like every other cell.
 *
 * The rule under a row sits on the cells for a second reason. The separated
 * model ignores `border` on rows, columns and their groups (CSS 2.1 §17.6.1),
 * so a `border-b` here would paint nothing at all.
 */
export function rowClass(clickable: boolean): string {
  return `[&>td]:border-b [&>td]:border-line-row ${
    clickable ? "[&>td]:relative hover:bg-row-hover focus-within:bg-row-hover" : ""
  }`;
}

/**
 * A column header, and the rules that let it pin.
 *
 * Two things here are not what they look like. The bottom rule is an inset
 * shadow rather than a border, because a sticky cell under the collapsed
 * border model leaves its own border behind — the borders belong to the table
 * there — and an inset shadow is the one form of that rule which pins with
 * the cell whichever model the table is in. And the background sits on the
 * cell rather than on the `<tr>`, because a row's background does not travel
 * with a cell that has pinned itself.
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
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr className="bg-surface-head">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                title={col.hint}
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
                      <>
                        {col.cell(row)}
                        {rowHref != null && <RowOverlay href={rowHref(row)} />}
                      </>
                    )}
                  </td>
                );
              })}
              <td aria-hidden>{rowHref != null && <RowOverlay href={rowHref(row)} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroller>
  );
}
