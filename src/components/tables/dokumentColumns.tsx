/**
 * Skolinspektionens documents for a skolenhet, grouped by skolform. Titles link
 * out to the document itself, so the rows carry a `url` alongside their display
 * fields.
 */

import type { Column } from "@/components/ui/DataTable";

export interface DokumentRow {
  key: string;
  skolform: string;
  typ: string;
  titel: string;
  /** Already formatted for display — see `bytes` in `@/lib/format`. */
  storlek: string;
  url: string;
}

export const dokumentColumns: Column<DokumentRow>[] = [
  {
    key: "skolform",
    header: "Skolform",
    width: 160,
    muted: true,
    cell: (r) => r.skolform,
  },
  { key: "typ", header: "Typ", width: 220, cell: (r) => r.typ, truncate: true },
  {
    key: "titel",
    header: "Titel",
    cell: (r) => (
      <a
        href={r.url}
        target="_blank"
        rel="noreferrer"
        className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
      >
        {r.titel}
      </a>
    ),
    truncate: true,
  },
  {
    key: "storlek",
    header: "Storlek",
    width: 88,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.storlek,
  },
];
