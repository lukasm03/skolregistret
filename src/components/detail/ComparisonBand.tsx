import type { Direction } from "@/lib/compare";
import { bandTone } from "./tone";

/**
 * One figure on its scale, with kommunen and riket marked on the same track.
 *
 * Three numbers that used to sit in three rows of a table sit in one object
 * here, and the question they were there to answer — is this above or below
 * the average — is answered by looking rather than by subtracting.
 *
 * Purely decorative: every mark on the band is printed as a figure beside it,
 * in `BandLegend` below and in the row's own value. A reader who never sees
 * the band loses nothing.
 */

interface Props {
  /** Where each figure sits along the metric's domain, in percent. */
  egenPct: number | null;
  kommunPct: number | null;
  riksPct: number | null;
  riktning: Direction;
  /** Taller for a card, shorter for a row in a list of five. */
  height?: number;
}

/** Kommunens tick: dashed, so it reads as the softer of the two references. */
const DASHED =
  "repeating-linear-gradient(var(--line-control) 0 3px, transparent 3px 6px)";

export function ComparisonBand({
  egenPct,
  kommunPct,
  riksPct,
  riktning,
  height = 24,
}: Props) {
  return (
    <span
      aria-hidden
      className="relative block rounded-xs border border-line-row bg-surface-head"
      style={{ height }}
    >
      {egenPct != null && (
        <>
          <span
            className={`absolute inset-y-0 left-0 rounded-l-[2px] ${bandTone[riktning]}`}
            style={{ width: `${egenPct}%` }}
          />
          {/* The unit's own figure, drawn last and heaviest — it is the
              subject, and the two averages are the context. */}
          <span
            className="absolute -top-0.5 -bottom-0.5 w-[4px] rounded-[2px] bg-ink"
            style={{ left: `calc(${egenPct}% - 2px)` }}
          />
        </>
      )}
      {kommunPct != null && (
        <span
          className="absolute -top-1 -bottom-1 w-[2px]"
          style={{ left: `${kommunPct}%`, background: DASHED }}
        />
      )}
      {riksPct != null && (
        <>
          <span
            className="absolute -top-1 -bottom-1 w-[2px] bg-accent"
            style={{ left: `${riksPct}%` }}
          />
          <span
            className="absolute -top-[7px] size-[6px] rounded-full bg-accent"
            style={{ left: `calc(${riksPct}% - 2px)` }}
          />
        </>
      )}
    </span>
  );
}

/**
 * What the three marks on a band stand for. Shown once per section rather than
 * once per band — five bands in a row need the key stated, not repeated.
 */
export function BandLegend({ enheten = "enheten" }: { enheten?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-[13px] w-[4px] rounded-[2px] bg-ink" />
        {enheten}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-[13px] w-[2px]" style={{ background: DASHED }} />
        kommunsnitt
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-[13px] w-[2px] bg-accent" />
        riksgenomsnitt
      </span>
    </div>
  );
}
