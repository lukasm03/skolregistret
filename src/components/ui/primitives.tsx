import Link from "next/link";
import { ChevronLeft } from "./icons";
import type { ReactNode } from "react";

/** Small uppercase label used above every field, stat and rail section. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-micro font-semibold tracking-[0.08em] text-ink-subtle uppercase">
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h2 className="text-base font-semibold">{children}</h2>
      {note && <span className="text-xs text-ink-subtle">{note}</span>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  note,
  sans,
}: {
  label: ReactNode;
  value: ReactNode;
  /** What the figure counts, set small beside it — "elever", "%". */
  unit?: ReactNode;
  note?: ReactNode;
  /**
   * The value is a word rather than a figure. Mono exists here to line digits
   * up in a column; a word set in it just looks like a typewriter.
   */
  sans?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5 sm:px-6 sm:py-4">
      <Label>{label}</Label>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            sans
              ? "text-[24px] leading-[1.1] font-semibold tracking-[-0.01em]"
              : "font-mono text-stat leading-[1.1]"
          }
        >
          {value}
        </span>
        {unit && <span className="text-sm text-ink-faint">{unit}</span>}
      </div>
      {note && <div className="text-xs leading-[1.45] text-ink-faint">{note}</div>}
    </div>
  );
}

/**
 * A stat tile whose content is a handful of dates rather than one figure —
 * how current the page's numbers are. Same footprint as `Stat` so it sits in
 * the same row without breaking the grid's rhythm.
 */
export function StatFacts({
  label,
  items,
}: {
  label: ReactNode;
  items: [ReactNode, ReactNode][];
}) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-4 py-3.5 sm:px-6 sm:py-4">
      <Label>{label}</Label>
      <dl className="flex flex-col gap-1">
        {items.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="m-0 font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A labelled fact in the page header — the handful of fields that identify the
 * unit, set in a row above the figures rather than run together on one line
 * with dots between them. Four short columns are scannable; one long sentence
 * of them is not.
 */
export function MetaField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <Label>{label}</Label>
      <div className="text-base">{children}</div>
    </div>
  );
}

/**
 * As many tiles per row as fit, which is all of them on a wide screen and two
 * on a phone — `auto-fit` collapses the tracks it doesn't fill, so a row of
 * four still divides the full width evenly.
 *
 * The separators are the grid's own background showing through a 1px gap
 * rather than a border per tile: a wrapped row would otherwise leave a rule
 * hanging at the end of the line.
 */
export function StatGrid({
  children,
  min = 158,
}: {
  children: ReactNode;
  /** Narrowest a tile may get before the row wraps. Raise it for wordier tiles. */
  min?: number;
}) {
  return (
    <div
      className="grid gap-px border-b border-line-soft bg-line-row"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-xl border border-ok-line bg-ok-bg px-2.5 py-[3px]">
      <span className="size-[5px] rounded-full bg-ok" />
      <span className="text-xs font-medium text-ok">{children}</span>
    </span>
  );
}

export function KoncernPill({ children }: { children: ReactNode }) {
  return (
    // Hover firms up the border rather than fading the pill: dimming a whole
    // token, label and all, reads as disabled instead of interactive.
    <span className="rounded-xl border border-warn-line bg-warn-bg px-2.5 py-[3px] text-xs font-medium text-warn transition-colors group-hover:border-warn">
      {children}
    </span>
  );
}

export function Dot() {
  return <span className="text-line-control">·</span>;
}

/** Key/value rows in the detail rails. */
export function FactList({
  items,
  twoColumn,
}: {
  items: [ReactNode, ReactNode][];
  /** Two columns above `md`, for a longer list inside a disclosure. */
  twoColumn?: boolean;
}) {
  return (
    <dl
      className={
        twoColumn
          ? "grid grid-cols-1 gap-x-14 gap-y-1 md:grid-cols-2"
          : "flex flex-col gap-[7px]"
      }
    >
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3">
          <dt className="text-base text-ink-muted">{k}</dt>
          <dd className="text-right text-base">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RailSection({
  title,
  children,
  divided = true,
}: {
  title: ReactNode;
  children: ReactNode;
  divided?: boolean;
}) {
  return (
    <section
      className={`flex flex-col gap-2 ${divided ? "border-t border-line-softer pt-[18px]" : ""}`}
    >
      <Label>{title}</Label>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-[1.55] text-ink-muted">{children}</p>;
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-line-softer bg-surface-subtle px-4 py-3.5 text-base leading-[1.55] text-ink-muted">
      {children}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-8 items-center justify-center rounded-md border border-line bg-surface px-3 text-base font-medium transition-transform hover:border-ink-faint active:scale-[0.96]"
    >
      {children}
    </Link>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-sm text-accent hover:underline"
    >
      <ChevronLeft size={11} />
      {children}
    </Link>
  );
}
