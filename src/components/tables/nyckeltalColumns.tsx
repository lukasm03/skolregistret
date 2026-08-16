/**
 * The nyckeltal table on the skolenhet detail page: each metric's own value,
 * followed by muted riksgenomsnitt/kommunsnitt comparison rows.
 *
 * Two row shapes on purpose. `NyckeltalRow` is the data model — one entry per
 * metric, carrying its comparisons as fields — and the detail page filters and
 * slices it (for the headline stats). `NyckeltalDisplayRow` is what the table
 * renders, where each comparison has been expanded into its own visual row.
 */

import type { Column } from "@/components/ui/DataTable";
import { DASH, dec, signed } from "@/lib/format";
import type { KommunNyckeltalStat, Nyckeltal } from "@/lib/skolregister";

export interface NyckeltalRow {
  key: keyof Nyckeltal;
  label: string;
  value: string;
  läsår: string;
  note: string | null;
  kommunsnitt: string;
  placering: string;
  riksgenomsnitt: string;
  /** The unit's own figure less the kommunsnitt; null when either is missing. */
  kommunDiff: number | null;
  riksDiff: number | null;
}

export const NYCKELTAL_LABELS: Record<keyof Nyckeltal, string> = {
  meritvärdeÅrskurs9: "Meritvärde, årskurs 9",
  andelGodkändaÅrskurs9: "Andel godkända, årskurs 9",
  andelBehörigaLärare: "Andel behöriga lärare",
  eleverPerLärare: "Elever per lärare",
};

export function nyckeltalRows(
  nyckeltal: Nyckeltal,
  kommunStats: KommunNyckeltalStat[],
  riksNyckeltal: Partial<Record<keyof Nyckeltal, number>>,
): NyckeltalRow[] {
  const statsByKey = new Map(kommunStats.map((s) => [s.key, s]));
  return (Object.keys(NYCKELTAL_LABELS) as (keyof Nyckeltal)[]).map((key) => {
    const v = nyckeltal[key];
    const stat = statsByKey.get(key);
    const kommunsnitt = stat?.genomsnitt != null ? dec(stat.genomsnitt) : DASH;
    const placering = stat?.rank != null ? `${stat.rank} av ${stat.antalRankade}` : DASH;
    const riks = riksNyckeltal[key];
    const riksgenomsnitt = riks != null ? dec(riks) : DASH;
    // Differences are taken from the numbers, never from the rendered
    // strings: `value` is the register's own Swedish text ("cirka 360"), and
    // parsing it back would quietly turn a rounded figure into an exact one.
    const diff = (mot: number | null | undefined) =>
      v.status === "finns" && mot != null ? v.tal - mot : null;
    return v.status === "finns"
      ? {
          key,
          label: NYCKELTAL_LABELS[key],
          value: v.text,
          läsår: v.läsår,
          note: null,
          kommunsnitt,
          placering,
          riksgenomsnitt,
          kommunDiff: diff(stat?.genomsnitt),
          riksDiff: diff(riks),
        }
      : {
          key,
          label: NYCKELTAL_LABELS[key],
          value: DASH,
          läsår: v.läsår ?? DASH,
          note: v.förklaring,
          kommunsnitt,
          placering: DASH,
          riksgenomsnitt,
          kommunDiff: null,
          riksDiff: null,
        };
  });
}

export interface NyckeltalDisplayRow {
  key: string;
  label: string;
  läsår: string;
  value: string;
  placering: string;
  note: string | null;
  /**
   * On a comparison row: how far the unit's own figure sits from this
   * average, already signed. Empty on the unit's own row, which is the thing
   * being compared.
   */
  diff: string;
  /** Riksgenomsnitt/kommunsnitt row for the metric above it, styled as a quieter comparison line. */
  muted?: boolean;
}

/** Expands one metric into its own data row followed by muted riks-/kommunsnitt comparison rows. */
export function nyckeltalDisplayRows(rows: NyckeltalRow[]): NyckeltalDisplayRow[] {
  return rows.flatMap((r) => {
    const main: NyckeltalDisplayRow = {
      key: r.key,
      label: r.label,
      läsår: r.läsår,
      value: r.value,
      placering: r.placering,
      note: r.note,
      diff: "",
    };
    const riks: NyckeltalDisplayRow | null =
      r.riksgenomsnitt !== DASH
        ? {
            key: `${r.key}-riks`,
            label: "Riksgenomsnitt",
            läsår: DASH,
            value: r.riksgenomsnitt,
            placering: DASH,
            note: null,
            diff: signed(r.riksDiff),
            muted: true,
          }
        : null;
    const kommun: NyckeltalDisplayRow | null =
      r.kommunsnitt !== DASH
        ? {
            key: `${r.key}-kommun`,
            label: "Kommunsnitt",
            läsår: DASH,
            value: r.kommunsnitt,
            placering: DASH,
            note: null,
            diff: signed(r.kommunDiff),
            muted: true,
          }
        : null;
    return [main, riks, kommun].filter((row): row is NyckeltalDisplayRow => row != null);
  });
}

function nyckeltalValueCell(value: string, muted: boolean | undefined) {
  return muted ? (
    <span className="text-ink-muted">{value}</span>
  ) : (
    <span className="font-medium">{value}</span>
  );
}

export const nyckeltalColumns: Column<NyckeltalDisplayRow>[] = [
  {
    key: "label",
    header: "Mått",
    cell: (r) => (
      <span
        className={`flex items-baseline gap-2 ${r.muted ? "pl-4 text-sm text-ink-muted" : ""}`}
      >
        {r.label}
        {r.note && <span className="text-xs text-ink-faint">{r.note}</span>}
      </span>
    ),
  },
  {
    key: "läsår",
    header: "Läsår",
    width: 82,
    mono: true,
    muted: true,
    cell: (r) => r.läsår,
  },
  {
    key: "value",
    header: "Värde",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => nyckeltalValueCell(r.value, r.muted),
  },
  {
    // The comparison rows carry the unit's distance from the average beside
    // it, so the two figures can be read as one line rather than subtracted
    // in your head.
    key: "diff",
    header: "Enheten mot snittet",
    width: 128,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.diff,
  },
  {
    key: "placering",
    header: "Placering i kommunen",
    width: 132,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.placering,
  },
];
