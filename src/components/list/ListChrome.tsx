"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { site } from "@/config/site";

export function ListToolbar({
  count,
  scope,
  children,
}: {
  count: ReactNode;
  scope: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-[42px] items-center gap-3.5 border-b border-line-soft px-4">
      <span className="text-base font-medium">{count}</span>
      <span className="text-base text-ink-subtle">{scope}</span>
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function ListFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex h-[44px] items-center gap-3 border-t border-line-soft bg-surface-subtle px-4">
      {children}
    </div>
  );
}

/**
 * First page, last page, and a window around the current one, with a gap marker
 * where numbers are skipped. Always the same number of slots, so the footer does
 * not reflow as you page through — 440 pages will not fit on one row.
 */
function pageWindow(
  page: number,
  totalPages: number,
  radius = 2,
): (number | "gap")[] {
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

export function Pagination({
  page,
  totalPages,
  onGoTo,
}: {
  page: number;
  totalPages: number;
  onGoTo: (page: number) => void;
}) {
  const box =
    "flex h-[27px] min-w-[27px] items-center justify-center rounded-md px-1 font-mono text-sm";

  return (
    <nav aria-label="Sidnavigering" className="flex items-center gap-1.5">
      <PageArrow
        onGoTo={() => onGoTo(page - 1)}
        disabled={page <= 1}
        label="Föregående sida"
      >
        ‹
      </PageArrow>
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
          <span
            key={p}
            aria-current="page"
            className={`${box} bg-ink text-white`}
          >
            {p}
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onGoTo(p)}
            aria-label={`Sida ${p}`}
            className={`${box} border border-line text-ink-muted hover:border-ink-faint`}
          >
            {p}
          </button>
        ),
      )}
      <PageArrow
        onGoTo={() => onGoTo(page + 1)}
        disabled={page >= totalPages}
        label="Nästa sida"
      >
        ›
      </PageArrow>
    </nav>
  );
}

function PageArrow({
  onGoTo,
  disabled,
  label,
  children,
}: {
  onGoTo: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const cls =
    "flex size-[27px] items-center justify-center rounded-md border border-line text-mono";
  return (
    <button
      type="button"
      onClick={onGoTo}
      disabled={disabled}
      aria-label={label}
      className={`${cls} ${disabled ? "text-ink-ghost" : "hover:border-ink-faint"}`}
    >
      {children}
    </button>
  );
}

/** Opens a small popup listing the configured page sizes to pick from. */
export function PerPageControl({
  perPage,
  onChange,
}: {
  perPage: number;
  onChange: (perPage: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[27px] items-center gap-[7px] rounded-md border border-line px-2.5 text-sm text-ink-muted hover:border-ink-faint"
      >
        <span>{perPage} per sida</span>
        <span aria-hidden className="text-[9px] text-ink-faint">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Rader per sida"
          className="absolute bottom-[calc(100%+4px)] right-0 z-10 min-w-full overflow-hidden rounded-md border border-line bg-surface py-1 shadow-md"
        >
          {perPageOptions.map((option) => (
            <li key={option} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option === perPage}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex h-[27px] w-full items-center whitespace-nowrap px-2.5 text-left text-sm hover:bg-surface-subtle ${
                  option === perPage
                    ? "font-medium text-ink"
                    : "text-ink-muted"
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
