/**
 * The nyckeltal in grid form — the "Tabell" view, for a reader who wants the
 * figures without the reading.
 *
 * It shows the same comparison the cards do, laid out as columns instead of
 * bands: the unit's own figure, kommunsnittet, riksgenomsnittet, the signed
 * difference and the placing. Nothing here is data the explained view lacks,
 * and nothing the explained view shows is missing here except the prose.
 */

import type { Column } from "@/components/ui/DataTable";
import { valueTone } from "@/components/detail/tone";
import { DASH, signed } from "@/lib/format";
import type { NyckeltalJämförelse } from "@/lib/nyckeltal-compare";

export const nyckeltalColumns: Column<NyckeltalJämförelse>[] = [
  {
    key: "label",
    header: "Mått",
    cell: (r) => (
      <span className="flex items-baseline gap-2">
        {r.label}
        {r.saknas && <span className="text-xs text-ink-faint">{r.saknas}</span>}
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
    header: "Enheten",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => <span className="font-medium">{r.value}</span>,
  },
  {
    key: "kommun",
    header: "Kommun",
    width: 96,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.kommun,
  },
  {
    key: "riks",
    header: "Riket",
    width: 112,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => (
      <>
        {r.riks}
        {r.beräknatRiks && <span className="text-ink-faint"> (ber.)</span>}
      </>
    ),
  },
  {
    key: "diff",
    header: "Mot riket",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) =>
      r.diffRiks == null ? (
        DASH
      ) : (
        <span className={valueTone[r.riktning]}>{signed(r.diffRiks)}</span>
      ),
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
