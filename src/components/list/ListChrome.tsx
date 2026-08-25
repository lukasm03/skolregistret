"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { site } from "@/config/site";
import type { ActiveFilter, ClearPatch } from "@/lib/active-filters";
import {
  DataGrid,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  type GridSort,
} from "@/components/ui/DataGrid";
import type { Column } from "@/components/ui/DataTable";
import type { RowData } from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, Close } from "@/components/ui/icons";

export function ListToolbar({
  count,
  children,
}: {
  count: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-line-soft px-4 py-2 sm:min-h-[42px] sm:py-1.5">
      {/*
        Filtering happens in the browser with no navigation, so nothing else
        tells a screen reader the list changed size. The count is the one
        thing worth announcing; the tokens beside it are reachable on their
        own terms.
      */}
      <span aria-live="polite" aria-atomic className="text-base font-medium">
        {count}
      </span>
      {children}
    </div>
  );
}

/**
 * The active filters, read back beside the count they produced. Each one
 * removes itself; "Rensa filter" removes the lot.
 */
export function FilterSummary({
  filters,
  onClear,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClear: (patch: ClearPatch) => void;
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onClear(f.clear)}
          className="flex max-w-[260px] items-center gap-1.5 rounded-sm border border-accent-line bg-accent-bg px-2 py-[3px] text-sm hover:border-accent"
        >
          <span className="flex-none text-ink-muted">{f.label}</span>
          <span className="truncate font-medium text-accent">{f.value}</span>
          <Close size={9} className="text-accent-soft" />
          <span className="sr-only">Ta bort filtret</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-sm px-1 py-[3px] text-sm text-ink-muted underline decoration-line-control underline-offset-2 hover:text-ink hover:decoration-ink-faint"
      >
        Rensa filter
      </button>
    </div>
  );
}

/**
 * The empty state. "Nothing matched" is only half the message when six
 * controls could be responsible — the way out belongs next to it.
 */
export function NoMatches({
  message,
  filters,
  onClearAll,
}: {
  message: string;
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2.5">
      {message}
      {filters.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="flex h-[26px] items-center rounded-md border border-line bg-surface px-2.5 text-sm font-medium text-ink transition-transform hover:border-ink-faint active:scale-[0.96]"
        >
          Rensa {filters.length === 1 ? "filtret" : `alla ${filters.length} filter`}
        </button>
      )}
    </span>
  );
}

function ListFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft bg-surface-subtle px-4 py-2 sm:h-[44px] sm:flex-nowrap sm:py-0">
      {children}
    </div>
  );
}

/**
 * First page, last page, and a window around the current one, with a gap marker
 * where numbers are skipped. Always the same number of slots, so the footer does
 * not reflow as you page through — 440 pages will not fit on one row.
 */
function pageWindow(page: number, totalPages: number, radius = 2): (number | "gap")[] {
  const keep = new Set<number>([1, totalPages]);
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= totalPages) keep.add(p);
  }
  // Pad at the ends so the row keeps its width near page 1 and the last page.
  const width = radius * 2 + 3;
  for (let p = 2; keep.size < Math.min(width, totalPages); p++) {
    if (page - radius > 1) keep.add(totalPages - p + 1);
    else keep.add(p);
  }

  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    // A single skipped page is spelled out — "…" would take the same room.
    if (prev && p - prev === 2) out.push(prev + 1);
    else if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

function Pagination({
  page,
  totalPages,
  onGoTo,
  pageHref,
}: {
  page: number;
  totalPages: number;
  onGoTo: (page: number) => void;
  /**
   * Where a given page lives, when the list keeps its page in the URL. With
   * it every number is a real link — Cmd-click and middle-click open page 7
   * in a tab, which a `<button>` can never do. Without it (the huvudman
   * detail tab, whose paging is local state) the numbers stay buttons,
   * because there is no address to give them.
   */
  pageHref?: (page: number) => string;
}) {
  const box =
    "flex h-[27px] min-w-[27px] items-center justify-center rounded-md px-1 font-mono text-sm";

  return (
    <nav aria-label="Sidnavigering" className="flex items-center gap-1.5">
      <PageStep
        page={page - 1}
        onGoTo={onGoTo}
        pageHref={pageHref}
        disabled={page <= 1}
        label="Föregående sida"
        className="flex size-[27px] items-center justify-center rounded-md border border-line text-micro"
      >
        <ChevronLeft />
      </PageStep>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-0.5 font-mono text-sm text-ink-faint"
          >
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${box} bg-ink text-ink-inverse`}>
            {p}
          </span>
        ) : (
          <PageStep
            key={p}
            page={p}
            onGoTo={onGoTo}
            pageHref={pageHref}
            disabled={false}
            label={`Sida ${p}`}
            className={`${box} border border-line text-ink-muted`}
          >
            {p}
          </PageStep>
        ),
      )}
      <PageStep
        page={page + 1}
        onGoTo={onGoTo}
        pageHref={pageHref}
        disabled={page >= totalPages}
        label="Nästa sida"
        className="flex size-[27px] items-center justify-center rounded-md border border-line text-micro"
      >
        <ChevronRight />
      </PageStep>
    </nav>
  );
}

/**
 * One step of the pager: an anchor where there is an address for it, a button
 * where there is not, and a disabled button at either end.
 *
 * The anchor still pages in place — the click handler bows out for any
 * modified click, so the browser keeps its own meaning for Cmd, Ctrl, Shift
 * and the middle button and we only intercept the plain one.
 */
function PageStep({
  page,
  onGoTo,
  pageHref,
  disabled,
  label,
  className,
  children,
}: {
  page: number;
  onGoTo: (page: number) => void;
  pageHref?: (page: number) => string;
  disabled: boolean;
  label: string;
  className: string;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-label={label}
        className={`${className} text-ink-ghost`}
      >
        {children}
      </button>
    );
  }

  if (!pageHref) {
    return (
      <button
        type="button"
        onClick={() => onGoTo(page)}
        aria-label={label}
        className={`${className} hover:border-ink-faint`}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={pageHref(page)}
      aria-label={label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onGoTo(page);
      }}
      className={`${className} hover:border-ink-faint`}
    >
      {children}
    </a>
  );
}

/** Opens a small popup listing the configured page sizes to pick from. */
function PerPageControl({
  perPage,
  onChange,
}: {
  perPage: number;
  onChange: (perPage: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Focus was inside the popup that just unmounted; send it back to
        // the trigger rather than dropping it on the body.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-[27px] items-center gap-[7px] rounded-md border border-line px-2.5 text-sm text-ink-muted hover:border-ink-faint"
      >
        <span>{perPage} per sida</span>
        <ChevronDown size={10} className="text-ink-faint" />
      </button>
      {open && (
        // Plain buttons rather than a listbox: a listbox promises arrow-key
        // navigation and typeahead, and a three-item picker reads better as
        // a disclosure of ordinary buttons. `aria-pressed` carries which one
        // is in force.
        <ul
          id={panelId}
          className="absolute bottom-[calc(100%+4px)] right-0 z-10 min-w-full overflow-hidden rounded-md border border-line-overlay bg-surface py-1 shadow-overlay"
        >
          {perPageOptions.map((option) => (
            <li key={option}>
              <button
                type="button"
                aria-pressed={option === perPage}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex h-[27px] w-full items-center whitespace-nowrap px-2.5 text-left text-sm hover:bg-surface-subtle ${
                  option === perPage ? "font-medium text-ink" : "text-ink-muted"
                }`}
              >
                {option} per sida
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const perPageOptions = site.pagination.perPageOptions;

/**
 * The chrome around one list's rows: height reservation, the grid itself, and
 * the footer with its "Visar X–Y av Z" line, pagination and per-page control.
 *
 * This is the one place the paging contract lives — clamping an out-of-range
 * page, deriving `from`/`to`, wiring the grid's 0-based index to a 1-based
 * page — so a change to any of it lands here rather than once per view. The
 * views keep everything that genuinely differs between them: parser,
 * selector, columns, filter panel, row hrefs, and how sort/page encode into
 * their state (URL params on the list pages, local state on the huvudman
 * detail tab).
 *
 * Pages are 1-based at this interface, matching the URL convention.
 */
export function ListPane<T extends RowData>({
  rows,
  columns,
  rowKey,
  rowHref,
  rowLabel,
  label,
  emptyMessage,
  sort,
  onSortChange,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  pageHref,
  stale = false,
  frameClassName,
}: {
  /** Filtered rows in tiebreak order — the pane sorts and pages them. */
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  rowLabel?: (row: T) => string;
  label?: string;
  emptyMessage?: ReactNode;
  sort: GridSort;
  onSortChange: (sort: GridSort) => void;
  /** 1-based; a value past the last page clamps here. */
  page: number;
  perPage: number;
  /** Receives the 1-based page to show. */
  onPageChange: (page: number) => void;
  /** Receiving the new size; resetting the page stays the caller's job. */
  onPerPageChange: (perPage: number) => void;
  /** Passed through to `Pagination` — see the note on its own prop. */
  pageHref?: (page: number) => string;
  /** Fades the table while a deferred query is still catching up. */
  stale?: boolean;
  /**
   * When set, grid and footer are wrapped in one element with these classes —
   * the framed look the huvudman detail tab uses. Unset, the footer sits
   * outside the reserved-height block as its own sibling, pushed to the
   * bottom of the column by `mt-auto`.
   */
  frameClassName?: string;
}) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const from = total ? (currentPage - 1) * perPage + 1 : 0;
  const to = Math.min(currentPage * perPage, total);

  const grid = (
    <DataGrid
      rows={rows}
      rowKey={rowKey}
      rowHref={rowHref}
      rowLabel={rowLabel}
      emptyMessage={emptyMessage}
      label={label}
      columns={columns}
      sort={sort}
      onSortChange={onSortChange}
      pageIndex={currentPage - 1}
      pageSize={perPage}
      onPageChange={(i) => onPageChange(i + 1)}
    />
  );

  const footer = (
    <ListFooter>
      {/* Tabular figures: paging changes all three numbers at once, and
          proportional digits shift the line's width as it goes. */}
      <span className="text-sm text-ink-muted tabular-nums">
        Visar {from}–{to} av {total}
      </span>
      <div className="flex-1" />
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onGoTo={onPageChange}
        pageHref={pageHref}
      />
      <PerPageControl perPage={perPage} onChange={onPerPageChange} />
    </ListFooter>
  );

  if (frameClassName) {
    return (
      <div
        style={{
          minHeight: HEADER_HEIGHT + ROW_HEIGHT * Math.max(1, Math.min(perPage, total)),
        }}
        className={frameClassName}
      >
        {grid}
        {footer}
      </div>
    );
  }

  return (
    <>
      {/*
        Reserve the height this page will occupy, so the footer does not jump
        as you page or filter. A full page of rows reserves a full page; a
        filter that leaves three rows reserves three, rather than the fixed
        712px that used to leave most of a screen blank under them.
      */}
      <div
        style={{
          minHeight: HEADER_HEIGHT + ROW_HEIGHT * Math.max(1, Math.min(perPage, total)),
        }}
        className={`transition-opacity duration-150 ${
          stale ? "opacity-60 delay-200" : ""
        }`}
      >
        {grid}
      </div>
      {footer}
    </>
  );
}
