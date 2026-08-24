/**
 * The nyckeltal, and the whole of what the skolenhet page says about them.
 *
 * The comparison the page used to draw as bands on cards is these columns:
 * the unit's own figure, kommunsnittet, riksgenomsnittet, the signed
 * difference and the placing. The "(beräknat)" caveat the cards used to carry
 * each is stated once, in the page's Källor section (`SkolaKällor`); the
 * riksvärde itself still prints "(ber.)" beside it here.
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
        {r.saknas && <span className="text-sm text-ink-faint">{r.saknas}</span>}
        {/* Gymnasiet reports these two per program only, so the unit's own
            figure is an average we computed — said here rather than left to
            the Källor section alone, because this is the row that shows it. */}
        {r.härlett && <span className="text-sm text-ink-faint">snitt av programmen</span>}
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
