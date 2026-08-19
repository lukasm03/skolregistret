/**
 * Skolenkäten in grid form — the "Tabell" view beside the explained cards.
 *
 * One row per reporting group, five question columns, and under each figure
 * the group's own distance from the riksgenomsnitt for the same group. Two
 * lines in a cell rather than two extra rows per group: the comparison belongs
 * to the figure, not beside it.
 */

import type { Column } from "@/components/ui/DataTable";
import { valueTone } from "@/components/detail/tone";
import { ENKÄT_DIMENSIONER, type EnkätJämförelse } from "@/lib/enkat-compare";
import { signed } from "@/lib/format";

function dimensionColumn(index: number): Column<EnkätJämförelse> {
  return {
    key: `dim-${index}`,
    header: ENKÄT_DIMENSIONER[index],
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => {
      const d = r.dimensioner[index];
      if (!d) return null;
      return (
        <span className="flex flex-col items-end">
          <span className="font-medium">{d.value}</span>
          {d.diff != null && (
            <span className={`text-micro ${valueTone[d.riktning]}`}>
              {signed(d.diff)}
            </span>
          )}
        </span>
      );
    },
  };
}

export const enkätColumns: Column<EnkätJämförelse>[] = [
  {
    key: "grupp",
    header: "Grupp",
    cell: (r) => r.grupp,
    truncate: true,
  },
  {
    key: "läsår",
    header: "Läsår",
    width: 76,
    mono: true,
    muted: true,
    cell: (r) => r.läsår,
  },
  {
    key: "antalSvar",
    header: "Svar",
    width: 76,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.antalSvar,
  },
  ...ENKÄT_DIMENSIONER.map((_, i) => dimensionColumn(i)),
];
