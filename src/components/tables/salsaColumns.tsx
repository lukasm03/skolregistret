/**
 * SALSA in grid form, beside the nyckeltal table on the skolenhet page.
 *
 * SALSA has no kommun/riks columns to fill — the deviation *is* the
 * comparison, against what the elevsammansättning statistically predicts —
 * so the row is the measure, the deviation, the actual figure behind it and
 * the scale that deviation is read on. What the model is gets said once, in
 * the page's Källor section (`SkolaKällor`); the per-measure prose the cards
 * used to unfold is the one thing this view drops.
 */

import type { Column } from "@/components/ui/DataTable";
import { valueTone } from "@/components/detail/tone";
import type { SalsaJämförelse } from "@/lib/salsa-compare";

export const salsaColumns: Column<SalsaJämförelse>[] = [
  {
    key: "label",
    header: "Mått",
    cell: (r) => r.label,
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
    header: "Avvikelse",
    width: 104,
    align: "right",
    mono: true,
    cell: (r) => (
      <span className={`font-medium ${valueTone[r.riktning]}`}>{r.value}</span>
    ),
  },
  {
    key: "faktisk",
    header: "Faktiskt",
    width: 148,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.faktisk,
  },
  {
    key: "skala",
    header: "Skala",
    width: 96,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.skala,
  },
  {
    key: "omdöme",
    header: "Mot förväntat",
    // Wide enough for the longest verdict — "I nivå med förväntat resultat" —
    // on one line. A verdict that wraps or truncates is worse than a column
    // that costs the table 30px of sideways room.
    width: 224,
    align: "right",
    muted: true,
    cell: (r) => r.omdöme,
  },
];
