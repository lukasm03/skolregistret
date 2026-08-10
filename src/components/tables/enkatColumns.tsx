/**
 * The skolenkät table on the skolenhet detail page. Each reporting group
 * (vårdnadshavare per skolform, elever per skolform+årskurs) gets its own row,
 * optionally followed by muted kommunsnitt/riksgenomsnitt comparison rows.
 */

import type { Column } from "@/components/ui/DataTable";
import { DASH, dec, num } from "@/lib/format";
import type {
  Elevenkät,
  EnkätGrupp,
  Enkätfråga,
  Vårdnadshavarenkät,
} from "@/lib/skolregister";

export interface EnkätRow {
  key: string;
  grupp: string;
  läsår: string;
  antalSvar: string;
  nöjdhet: string;
  trygghet: string;
  studiero: string;
  stöd: string;
  stimulans: string;
  /** Kommunsnitt/riksgenomsnitt rows, styled as a quieter comparison line rather than a unit's own answers. */
  muted?: boolean;
}

function frågaGenomsnitt(f: Enkätfråga | null): string {
  return f?.genomsnitt != null ? dec(f.genomsnitt) : DASH;
}

export function enkätRow(
  key: string,
  grupp: string,
  e: Vårdnadshavarenkät | Elevenkät,
): EnkätRow {
  return {
    key,
    grupp,
    läsår: e.läsår ?? DASH,
    antalSvar: e.antalSvar != null ? num(e.antalSvar) : DASH,
    nöjdhet: frågaGenomsnitt(e.nöjdhet),
    trygghet: frågaGenomsnitt(e.trygghet),
    studiero: frågaGenomsnitt(e.studiero),
    stöd: frågaGenomsnitt(e.stöd),
    stimulans: frågaGenomsnitt(e.stimulans),
  };
}

/** `null` when the grupp has no schools to average, so the caller can drop the row entirely. */
export function enkätGenomsnittRow(
  key: string,
  grupp: string,
  g: EnkätGrupp | undefined,
): EnkätRow | null {
  if (!g || Object.values(g.genomsnitt).every((v) => v == null)) return null;
  const val = (k: keyof EnkätGrupp["genomsnitt"]) =>
    g.genomsnitt[k] != null ? dec(g.genomsnitt[k]!) : DASH;
  return {
    key,
    grupp,
    läsår: g.läsår ?? DASH,
    antalSvar: g.antalSvar != null ? dec(g.antalSvar) : DASH,
    nöjdhet: val("nöjdhet"),
    trygghet: val("trygghet"),
    studiero: val("studiero"),
    stöd: val("stöd"),
    stimulans: val("stimulans"),
    muted: true,
  };
}

function enkätCell(value: string, muted: boolean | undefined) {
  return muted ? <span className="text-ink-muted">{value}</span> : value;
}

export const enkätColumns: Column<EnkätRow>[] = [
  {
    key: "grupp",
    header: "Enkät",
    cell: (r) => (
      <span className={r.muted ? "pl-4 text-sm text-ink-muted" : undefined}>
        {r.grupp}
      </span>
    ),
    truncate: true,
  },
  {
    key: "läsår",
    header: "Läsår",
    width: 82,
    mono: true,
    cell: (r) => enkätCell(r.läsår, r.muted),
  },
  {
    key: "antalSvar",
    header: "Antal svar",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.antalSvar, r.muted),
  },
  {
    key: "nöjdhet",
    header: "Nöjdhet",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.nöjdhet, r.muted),
  },
  {
    key: "trygghet",
    header: "Trygghet",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.trygghet, r.muted),
  },
  {
    key: "studiero",
    header: "Studiero",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.studiero, r.muted),
  },
  {
    key: "stöd",
    header: "Stöd",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.stöd, r.muted),
  },
  {
    key: "stimulans",
    header: "Stimulans",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.stimulans, r.muted),
  },
];
