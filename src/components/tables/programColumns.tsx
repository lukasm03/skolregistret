/**
 * The gymnasieprogram in grid form — one row per programme, one column per
 * measure, and under each figure the programme's own distance from the same
 * programme nationally.
 *
 * The shape is `enkatColumns`': two lines in a cell rather than a second row
 * of figures, because the comparison belongs to the figure and not beside it.
 * What this replaces is a table of its own making — grouped spanning headers,
 * a pinned name column, sortable headers and a row that unfolded into six
 * deviation bars. None of that is worn by the nyckeltal, SALSA or enkät tabs
 * next to it, and the tab strip reads as one page now that the program tab
 * does not either.
 *
 * The two undirected measures — elevantal and lägsta antagningspoäng — print
 * their figure and nothing under it: a programme being bigger than the
 * national one is not a programme being better, and a difference drawn under
 * it would say it was.
 */

import type { Column } from "@/components/ui/DataTable";
import { valueTone } from "@/components/detail/tone";
import { programmetriker } from "@/config/programmetriker";
import { DASH, signed } from "@/lib/format";
import type { ProgramComparison } from "@/lib/program-compare";

/**
 * One width for all six, so the figures line up as a block rather than as six
 * columns of different importance. Wide enough for the longest header —
 * "LÄGSTA POÄNG" — on one line, since a header that wraps outgrows the fixed
 * header height every table on the site shares.
 */
const MÅTT_BREDD = 112;

function måttColumn(index: number): Column<ProgramComparison> {
  const metrik = programmetriker[index];
  return {
    key: metrik.key,
    header: metrik.label,
    // The header is abbreviated to fit the column, so this is the only place
    // the measure is spelled out. It was `title` plus an `aria-describedby`
    // hint on a sort button before; with no focusable header left, `title` on
    // the cell is both the tooltip and the description assistive tech reads.
    hint: metrik.hint,
    width: MÅTT_BREDD,
    align: "right",
    mono: true,
    cell: (r) => {
      const cell = r.cells[index];
      if (!cell) return null;
      if (cell.tal == null) return <span className="text-ink-ghost">{DASH}</span>;
      return (
        <span className="flex flex-col items-end">
          <span className="font-medium">{cell.text}</span>
          {cell.riktning !== "none" && cell.diff != null && (
            <span className={`text-micro ${valueTone[cell.riktning]}`}>
              {signed(cell.diff)}
            </span>
          )}
        </span>
      );
    },
  };
}

export const programColumns: Column<ProgramComparison>[] = [
  {
    key: "program",
    header: "Program",
    cell: (r) => r.namn,
    truncate: true,
  },
  ...programmetriker.map((_, i) => måttColumn(i)),
];
